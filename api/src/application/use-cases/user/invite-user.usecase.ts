import { Conflict } from "@/application/errors/conflict.error";
import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import type { IEmailService } from "@/application/ports/email-service.port";
import { DoctorSpecialtiesGuards } from "@/application/use-cases/doctor-profile/doctor-specialties.guards";
import { MAX_SPECIALTIES_PER_DOCTOR } from "@/application/use-cases/doctor-profile/doctor-specialties.schema";
import type { IDoctorProfileRepository } from "@/domain/repositories/doctor-profile.repository";
import type { IMembershipRepository } from "@/domain/repositories/membership.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { TokenService } from "@/domain/services/token-service";
import { CanEditOrganizationSpecialtiesQuery } from "@/infrastructure/postgres/queries/organization/can-edit-organization-specialties.query";
import { lockAccountQuota } from "@/infrastructure/postgres/lock-account-quota";
import { DoctorProfileRepository } from "@/infrastructure/postgres/repositories/doctor-profile.repository";
import { MembershipRepository } from "@/infrastructure/postgres/repositories/membership.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import {
  type InvitationStatus,
  type MembershipRole,
  Prisma,
} from "@prisma/client";
import { BLOCKING_APPOINTMENT_STATUSES } from "@/domain/entities/appointment/entity";
import z from "zod";

export const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

const inviteeFieldsSchema = z.object({
  // Better Auth busca al usuario en minúsculas al iniciar sesión.
  email: z.email({ error: "Correo inválido" }).toLowerCase(),
  name: z.string("Name is required"),
  lastName: z.string("Lastname is required"),
  phone: z.string("Phone is required"),
});

export const inviteUserBodySchema = inviteeFieldsSchema
  .extend({
    role: z.enum(["DOCTOR", "USER"], { error: "Elige un rol" }),
    specialtyIds: z
      .array(z.uuid({ error: "Especialidad inválida" }))
      .max(MAX_SPECIALTIES_PER_DOCTOR, {
        error: "Puedes elegir hasta 50 especialidades",
      })
      .optional(),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    error: "Elige al menos una especialidad",
    path: ["specialtyIds"],
  });

export const inviteOrganizationUserBodySchema = inviteeFieldsSchema.extend({
  role: z.enum(["ADMIN", "USER"], { error: "Membership role is required" }),
});

export const inviteUserParamsSchema = z.object({
  resourceId: z.uuid(),
});

type InviteeFields = z.infer<typeof inviteeFieldsSchema>;

export type InviteUserDto = InviteeFields & {
  resourceId: string;
  createdBy: string;
  accountId: string;
} & (
    | {
        resourceType: "CLINIC";
        role: "DOCTOR" | "USER";
        specialtyIds?: string[];
      }
    | { resourceType: "ORGANIZATION"; role: "ADMIN" | "USER" }
  );

export interface AttendingClinic {
  clinicId: string;
  clinicName: string;
}

export interface AssignResult {
  outcome: "created" | "revived" | "updated";
  invitationSent: boolean;
  message: string;
  // Sólo al degradar a un ADMIN de la organización.
  stoppedAttending?: AttendingClinic[];
  stillAttending?: (AttendingClinic & { pendingAppointments: number })[];
}

interface InviteUserUseCaseService {
  emailService: IEmailService;
}

interface InvitationResource {
  name: string;
  organizationId: string;
}

interface SavedUser {
  id: string;
  email: string;
  name: string;
  lastName: string;
}

interface ExistingMembership {
  id: string;
  role: MembershipRole;
  deletedAt: Date | null;
  invitation: { status: InvitationStatus; expiresAt: Date } | null;
}

type Outcome = AssignResult["outcome"];

const CONCURRENT_ASSIGNMENT_MESSAGE =
  "Alguien acaba de cambiar el acceso de esta persona. Vuelve a intentarlo.";

// Asigna a una persona a la organización o a una sede: crea, revive o edita su
// membership y, como Médico en una sede, su perfil.
export class InviteUserUseCase {
  constructor(
    private readonly tx: ITransactionManager,
    private readonly services: InviteUserUseCaseService,
    private readonly tokens = new TokenService(),
    private readonly doctorProfiles: IDoctorProfileRepository = new DoctorProfileRepository(),
    private readonly guards = new DoctorSpecialtiesGuards(
      doctorProfiles,
      new CanEditOrganizationSpecialtiesQuery(),
    ),
    private readonly memberships: IMembershipRepository = new MembershipRepository(),
  ) {}

  // La política acepta cualquier recurso donde el usuario es ADMIN (también una sede por herencia): se exige el tipo de la ruta y la cuenta de la sesión.
  private async findInvitationResource(
    data: InviteUserDto,
  ): Promise<InvitationResource> {
    const client = getClient();
    const where = {
      resourceId: data.resourceId,
      resource: { accountId: data.accountId },
    };

    if (data.resourceType === "ORGANIZATION") {
      const organization = await client.organization.findFirst({ where });
      if (!organization) throw new NotFound("Organización no encontrada");
      return { name: organization.name, organizationId: data.resourceId };
    }

    const clinic = await client.clinic.findFirst({
      where,
      include: { resource: { select: { parentResourceId: true } } },
    });
    if (!clinic?.resource.parentResourceId)
      throw new NotFound("Sede no encontrada");
    return {
      name: clinic.name,
      organizationId: clinic.resource.parentResourceId,
    };
  }

  private async findOrCreateUser(data: InviteUserDto): Promise<SavedUser> {
    const client = getClient();

    const user = await client.user.findUnique({ where: { email: data.email } });

    if (user && user.accountId !== data.accountId) {
      throw new UnprocessableEntity(
        "Ya existe una cuenta con este correo en otra cuenta",
      );
    }

    if (user) return user;

    return await client.user.create({
      data: {
        email: data.email,
        name: data.name,
        lastName: data.lastName,
        phone: data.phone,
        accountId: data.accountId,
      },
    });
  }

  // Excepción a «toda lectura filtra deletedAt»: una membership borrada se revive, no se duplica.
  private async findMembership(
    userId: string,
    resourceId: string,
  ): Promise<ExistingMembership | null> {
    return await getClient().userResourceMembership.findUnique({
      where: { userId_resourceId: { userId, resourceId } },
      include: { invitation: { select: { status: true, expiresAt: true } } },
    });
  }

  // Sin esto, un ADMIN podría dejar la organización sin administradores o bajar al dueño.
  private async assertRoleCanChange(
    data: InviteUserDto,
    user: SavedUser,
    membership: ExistingMembership | null,
  ) {
    if (!membership) return;

    // Los ADMIN directos de sede son datos antiguos: un ADMIN no los degrada.
    if (data.resourceType === "CLINIC") {
      if (!membership.deletedAt && membership.role === "ADMIN") {
        throw new Conflict(
          "El rol de un administrador de la sede no se puede cambiar.",
        );
      }
      return;
    }

    if (membership.role === data.role) return;

    // También con la membership borrada: así nadie revive al dueño con otro rol.
    if (user.id === data.createdBy) {
      throw new Conflict("No puedes cambiar tu propio rol.");
    }

    const owner = await getClient().account.findFirst({
      where: { id: data.accountId, ownerId: user.id },
      select: { id: true },
    });
    if (owner) {
      throw new Conflict("El rol del dueño de la cuenta no se puede cambiar.");
    }
  }

  private async saveMembership(
    data: InviteUserDto,
    userId: string,
    existing: ExistingMembership | null,
  ): Promise<{ membershipId: string; outcome: Outcome }> {
    const client = getClient();

    if (!existing) {
      const created = await client.userResourceMembership.create({
        data: {
          role: data.role,
          accountId: data.accountId,
          userId,
          resourceId: data.resourceId,
          createdBy: data.createdBy,
        },
      });
      return { membershipId: created.id, outcome: "created" };
    }

    if (existing.deletedAt) {
      await client.userResourceMembership.update({
        where: { id: existing.id },
        data: { deletedAt: null, role: data.role },
      });
      return { membershipId: existing.id, outcome: "revived" };
    }

    if (existing.role !== data.role) {
      await client.userResourceMembership.update({
        where: { id: existing.id },
        data: { role: data.role },
      });
    }
    return { membershipId: existing.id, outcome: "updated" };
  }

  // El enfriamiento es por persona: al asignar varias sedes sale un solo correo.
  // Una emisión futura (invitaciones viejas de 7 días) queda fuera y se renueva siempre.
  private async wasPersonInvitedRecently(userId: string) {
    const now = Date.now();
    const count = await getClient().userInvitation.count({
      where: {
        membership: { userId },
        status: "INVITED",
        acceptedAt: null,
        expiresAt: {
          gt: new Date(now + INVITATION_TTL_MS - INVITATION_RESEND_COOLDOWN_MS),
          lte: new Date(now + INVITATION_TTL_MS),
        },
      },
    });
    return count > 0;
  }

  private freshInvitationFields() {
    return {
      token: this.tokens.generate(),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    };
  }

  // El filtro de estado evita revertir una invitación que se aceptó entre la lectura y esta escritura.
  private async renewInvitation(membershipId: string, invitedBy: string) {
    const fields = this.freshInvitationFields();

    // El enfriamiento va en el WHERE: dos peticiones en paralelo no reenvían dos correos.
    const now = Date.now();
    const issuedBefore = new Date(
      now + INVITATION_TTL_MS - INVITATION_RESEND_COOLDOWN_MS,
    );
    const { count } = await getClient().userInvitation.updateMany({
      where: {
        membershipId,
        status: { not: "ACCEPTED" },
        acceptedAt: null,
        OR: [
          { status: { not: "INVITED" } },
          { expiresAt: { lte: issuedBefore } },
          { expiresAt: { gt: new Date(now + INVITATION_TTL_MS) } },
        ],
      },
      data: { ...fields, status: "INVITED", invitedBy },
    });

    return count === 1 ? fields : null;
  }

  private async issueInvitation(
    userId: string,
    membershipId: string,
    invitation: ExistingMembership["invitation"],
    invitedBy: string,
  ) {
    // Serializa por persona: sin esto, dos peticiones en paralelo cuentan antes de que la otra confirme y envían dos correos.
    // El bloqueo dura hasta confirmar la transacción, que incluye el envío del correo.
    await getClient()
      .$queryRaw`SELECT 1 FROM public.user WHERE id = ${userId}::uuid FOR UPDATE`;
    if (await this.wasPersonInvitedRecently(userId)) return null;

    if (!invitation) {
      const fields = this.freshInvitationFields();
      await getClient().userInvitation.create({
        data: { ...fields, membershipId, invitedBy },
      });
      return fields;
    }

    if (invitation.status === "ACCEPTED") return null;

    return await this.renewInvitation(membershipId, invitedBy);
  }

  // El acceso ya no depende de la invitación: el correo sólo sirve para crear la contraseña.
  private async sendInvitationIfNeeded(
    user: SavedUser,
    membershipId: string,
    invitation: ExistingMembership["invitation"],
    invitedBy: string,
    resourceName: string,
  ): Promise<boolean> {
    const passwords = await getClient().authAccount.count({
      where: { userId: user.id, providerId: "credential" },
    });
    if (passwords > 0) return false;

    const fields = await this.issueInvitation(
      user.id,
      membershipId,
      invitation,
      invitedBy,
    );
    if (!fields) return false;

    const html = await renderTemplate("invite-user", {
      inviteUrl: `${process.env.FRONTEND_URL}/invite/accept?token=${fields.token}`,
      name: `${user.name} ${user.lastName}`,
      resourceName,
    });

    // Dentro de la transacción: si el correo falla, no queda una membership que impida reintentar.
    await this.services.emailService.send({
      html,
      subject: "WizyDoc - Invitación",
      to: user.email,
    });
    return true;
  }

  private stepDownSummary(stepDown: {
    stopped: AttendingClinic[];
    kept: (AttendingClinic & { pendingAppointments: number })[];
  }) {
    const list = new Intl.ListFormat("es", { type: "conjunction" });
    const parts: string[] = [];
    if (stepDown.stopped.length > 0) {
      parts.push(
        ` Dejó de atender en ${list.format(stepDown.stopped.map((c) => c.clinicName))}.`,
      );
    }
    if (stepDown.kept.length > 0) {
      parts.push(
        ` Sigue atendiendo en ${list.format(
          stepDown.kept.map(
            (c) =>
              `${c.clinicName} (${c.pendingAppointments} ${c.pendingAppointments === 1 ? "cita pendiente" : "citas pendientes"})`,
          ),
        )}.`,
      );
    }
    return parts.join("");
  }

  private buildMessage(
    data: InviteUserDto,
    user: SavedUser,
    resourceName: string,
    outcome: Outcome,
    invitationSent: boolean,
  ): string {
    const isSelf = user.id === data.createdBy;
    const fullName = `${user.name} ${user.lastName}`;

    if (outcome === "updated") {
      if (isSelf) return "Guardamos tus cambios.";
      return `Guardamos los cambios de ${fullName}.${invitationSent ? " Le reenviamos la invitación." : ""}`;
    }

    if (data.resourceType === "ORGANIZATION") {
      return invitationSent
        ? "Invitación enviada."
        : `Listo. ${fullName} ya tiene acceso a todas las sedes de ${resourceName}.`;
    }

    if (isSelf && data.role === "DOCTOR") {
      return `Listo. Ya atiendes en ${resourceName}. Configura tus horarios para aparecer en el link de reserva.`;
    }

    return invitationSent
      ? `Invitación enviada. ${fullName} aparece en los usuarios de ${resourceName}.`
      : `Listo. ${fullName} ya tiene acceso a ${resourceName}.`;
  }

  private becomesOrganizationAdmin(
    data: InviteUserDto,
    existing: ExistingMembership | null,
  ) {
    return (
      data.resourceType === "ORGANIZATION" &&
      data.role === "ADMIN" &&
      !(existing && !existing.deletedAt && existing.role === "ADMIN")
    );
  }

  // En serie: el cliente de una transacción interactiva no admite consultas en paralelo.
  private async grantAttendingInOrganizationClinics(
    userId: string,
    data: InviteUserDto,
  ) {
    const clinicIds = await this.memberships.findOrganizationClinicIds(
      data.resourceId,
      data.accountId,
    );
    for (const clinicId of clinicIds) {
      await this.memberships.grantAttending({
        userId,
        clinicId,
        accountId: data.accountId,
        createdBy: data.createdBy,
      });
    }
  }

  private becomesOrganizationUser(
    data: InviteUserDto,
    existing: ExistingMembership | null,
  ) {
    return (
      data.resourceType === "ORGANIZATION" &&
      data.role === "USER" &&
      !!existing &&
      !existing.deletedAt &&
      existing.role === "ADMIN"
    );
  }

  // Sale de las sedes donde ya no tiene citas por atender; con citas pendientes sigue como Médico.
  // Sólo se borra la membership: el perfil, los horarios y las especialidades quedan para el regreso.
  private async stopAttendingWithoutAppointments(
    userId: string,
    data: InviteUserDto,
  ) {
    const client = getClient();
    const memberships = await client.userResourceMembership.findMany({
      where: {
        userId,
        accountId: data.accountId,
        role: "DOCTOR",
        deletedAt: null,
        resource: {
          parentResourceId: data.resourceId,
          accountId: data.accountId,
        },
      },
      select: {
        id: true,
        resourceId: true,
        resource: { select: { clinic: { select: { name: true } } } },
        doctorProfile: { select: { id: true } },
      },
    });

    const stopped: AttendingClinic[] = [];
    const kept: (AttendingClinic & { pendingAppointments: number })[] = [];
    const stoppedIds: string[] = [];

    for (const membership of memberships) {
      const clinic = {
        clinicId: membership.resourceId,
        clinicName: membership.resource.clinic?.name ?? "",
      };
      const pendingAppointments = membership.doctorProfile
        ? await client.appointment.count({
            where: {
              doctorProfileId: membership.doctorProfile.id,
              status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
              scheduledAt: { gte: new Date() },
            },
          })
        : 0;

      if (pendingAppointments > 0) {
        kept.push({ ...clinic, pendingAppointments });
      } else {
        stopped.push(clinic);
        stoppedIds.push(membership.id);
      }
    }

    if (stoppedIds.length > 0) {
      await client.userResourceMembership.updateMany({
        where: { id: { in: stoppedIds }, accountId: data.accountId },
        data: { deletedAt: new Date() },
      });
    }

    const byName = (a: AttendingClinic, b: AttendingClinic) =>
      a.clinicName.localeCompare(b.clinicName, "es");
    return { stopped: stopped.sort(byName), kept: kept.sort(byName) };
  }

  private async assign(data: InviteUserDto): Promise<AssignResult> {
    const resource = await this.findInvitationResource(data);

    let specialtyIds: string[] = [];
    if (data.resourceType === "CLINIC" && data.role === "DOCTOR") {
      await this.guards.assertCanEdit({
        userId: data.createdBy,
        accountId: data.accountId,
        organizationId: resource.organizationId,
        clinicId: data.resourceId,
      });
      specialtyIds = await this.guards.uniqueSpecialtiesOfClinicOrganization(
        data.resourceId,
        data.specialtyIds ?? [],
      );
    }

    const user = await this.findOrCreateUser(data);
    const existing = await this.findMembership(user.id, data.resourceId);

    await this.assertRoleCanChange(data, user, existing);

    const promoted = this.becomesOrganizationAdmin(data, existing);
    // Se reutiliza el bloqueo de cuota para serializar altas de sede y promociones.
    // Ojo: se mantiene hasta confirmar, también durante el envío del correo por SES;
    // el ticket del tope de citas debe tenerlo en cuenta si cuenta bajo este mismo bloqueo.
    const demoted = this.becomesOrganizationUser(data, existing);
    if (promoted || demoted) await lockAccountQuota(data.accountId);

    const { membershipId, outcome } = await this.saveMembership(
      data,
      user.id,
      existing,
    );

    if (data.resourceType === "CLINIC" && data.role === "DOCTOR") {
      await this.doctorProfiles.upsertForMembership(membershipId, specialtyIds);
    }

    if (promoted) await this.grantAttendingInOrganizationClinics(user.id, data);
    const stepDown = demoted
      ? await this.stopAttendingWithoutAppointments(user.id, data)
      : null;

    const invitationSent = await this.sendInvitationIfNeeded(
      user,
      membershipId,
      existing?.invitation ?? null,
      data.createdBy,
      resource.name,
    );

    const message = this.buildMessage(
      data,
      user,
      resource.name,
      outcome,
      invitationSent,
    );

    return {
      outcome,
      invitationSent,
      message: stepDown
        ? `${message}${this.stepDownSummary(stepDown)}`
        : message,
      ...(stepDown && {
        stoppedAttending: stepDown.stopped,
        stillAttending: stepDown.kept,
      }),
    };
  }

  async execute(data: InviteUserDto): Promise<AssignResult> {
    try {
      return await this.tx.runInTransaction(() => this.assign(data));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Conflict(CONCURRENT_ASSIGNMENT_MESSAGE);
      }
      throw error;
    }
  }
}
