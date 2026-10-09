import { Conflict } from "@/application/errors/conflict.error";
import { NotFound } from "@/application/errors/not-found.error";
import { PaymentRequired } from "@/application/errors/payment-required.error";
import { TooManyRequests } from "@/application/errors/too-many-requests.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import type { IEmailService } from "@/application/ports/email-service.port";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { lockAccountQuota } from "@/infrastructure/postgres/lock-account-quota";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import { type InvitationStatus, MembershipRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
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
    role: z.enum(MembershipRole, { error: "Membership role is required" }),
    specialtyIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    message: "At least one specialty is required for a doctor",
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
        role: MembershipRole;
        specialtyIds?: string[];
      }
    | { resourceType: "ORGANIZATION"; role: "ADMIN" | "USER" }
  );

interface ExistingMembership {
  id: string;
  deletedAt: Date | null;
  invitation: { status: InvitationStatus; expiresAt: Date } | null;
}

interface InviteUserUseCaseService {
  emailService: IEmailService;
}

export class InviteUserUseCase {
  constructor(
    private readonly tx: ITransactionManager,
    private readonly services: InviteUserUseCaseService,
    private readonly entitlementsQuery = new GetAccountEntitlements(),
  ) {}

  // Sin este filtro se podrían conectar especialidades de otra organización o cuenta.
  private async assertSpecialtiesBelongToClinicOrganization(
    clinicResourceId: string,
    specialtyIds: string[],
  ) {
    const uniqueSpecialtyIds = [...new Set(specialtyIds)];

    const ownSpecialtiesCount = await getClient().specialty.count({
      where: {
        id: { in: uniqueSpecialtyIds },
        organization: {
          resource: { children: { some: { id: clinicResourceId } } },
        },
      },
    });

    // Mismo 404 para id inexistente y de otra cuenta.
    if (ownSpecialtiesCount !== uniqueSpecialtyIds.length) {
      throw new NotFound("Especialidad no encontrada");
    }

    return uniqueSpecialtyIds;
  }

  /**
   * El plan cuenta médicos, no perfiles: el mismo doctor atendiendo en tres
   * sedes ocupa una plaza, no tres.
   */
  private async assertDoctorSeatAvailable(accountId: string, userId: string) {
    await lockAccountQuota(accountId);

    const entitlements = await this.entitlementsQuery.execute(accountId);

    const doctors = await getClient().userResourceMembership.findMany({
      where: { accountId, role: "DOCTOR", deletedAt: null },
      distinct: ["userId"],
      select: { userId: true },
    });

    if (doctors.some((doctor) => doctor.userId === userId)) return;

    if (!isWithinLimit(entitlements.maxDoctors, doctors.length)) {
      throw new PaymentRequired(
        `El plan ${entitlements.plan} incluye ${entitlements.maxDoctors} médicos`,
      );
    }
  }

  // La política acepta cualquier recurso donde el usuario es ADMIN (también una sede por herencia): se exige el tipo de la ruta y la cuenta de la sesión.
  private async findInvitationResource(
    data: InviteUserDto,
  ): Promise<{ name: string }> {
    const client = getClient();
    const where = {
      resourceId: data.resourceId,
      resource: { accountId: data.accountId },
    };

    if (data.resourceType === "ORGANIZATION") {
      const organization = await client.organization.findFirst({ where });
      if (!organization) throw new NotFound("Organización no encontrada");
      return organization;
    }

    const clinic = await client.clinic.findFirst({ where });
    if (!clinic) throw new NotFound("Sede no encontrada");
    return clinic;
  }

  private async findMembershipWithInvitation(
    userId: string,
    resourceId: string,
  ) {
    return await getClient().userResourceMembership.findUnique({
      where: { userId_resourceId: { userId, resourceId } },
      include: { invitation: { select: { status: true, expiresAt: true } } },
    });
  }

  private assertInvitationCanBeRenewed(membership: ExistingMembership) {
    if (membership.deletedAt) {
      throw new Conflict(
        "Esta persona fue eliminada de este recurso y no se puede volver a invitar.",
      );
    }

    if (!membership.invitation || membership.invitation.status === "ACCEPTED") {
      throw new Conflict("Esta persona ya es miembro.");
    }

    if (this.wasIssuedRecently(membership.invitation)) {
      throw new TooManyRequests(
        "Ya se envió una invitación hace poco. Espera unos minutos antes de volver a enviarla.",
      );
    }
  }

  // Una fecha de emisión futura sale de las invitaciones de 7 días: se pueden renovar siempre.
  private wasIssuedRecently(invitation: {
    status: InvitationStatus;
    expiresAt: Date;
  }) {
    if (invitation.status !== "INVITED") return false;

    const issuedAt = invitation.expiresAt.getTime() - INVITATION_TTL_MS;
    const elapsedMs = Date.now() - issuedAt;

    return elapsedMs >= 0 && elapsedMs < INVITATION_RESEND_COOLDOWN_MS;
  }

  private async createMembershipWithInvitation(
    data: InviteUserDto,
    userId: string,
  ) {
    const client = getClient();

    if (data.resourceType === "CLINIC" && data.role === "DOCTOR") {
      await this.assertDoctorSeatAvailable(data.accountId, userId);
      const uniqueSpecialtyIds =
        await this.assertSpecialtiesBelongToClinicOrganization(
          data.resourceId,
          data.specialtyIds ?? [],
        );

      await client.doctorProfile.create({
        data: {
          userId,
          clinicId: data.resourceId,
          specialties: {
            connect: uniqueSpecialtyIds.map((id) => ({ id })),
          },
        },
      });
    }

    const membership = await client.userResourceMembership.create({
      data: {
        role: data.role,
        accountId: data.accountId,
        userId,
        resourceId: data.resourceId,
        createdBy: data.createdBy,
      },
    });

    return await client.userInvitation.create({
      data: {
        ...this.freshInvitationFields(),
        membershipId: membership.id,
        invitedBy: data.createdBy,
      },
    });
  }

  private async renewExistingInvitation(
    membership: ExistingMembership,
    invitedBy: string,
  ) {
    this.assertInvitationCanBeRenewed(membership);
    return await this.renewInvitation(membership.id, invitedBy);
  }

  // El filtro de estado evita revertir una invitación que se aceptó entre la lectura y esta escritura.
  private async renewInvitation(membershipId: string, invitedBy: string) {
    const fields = this.freshInvitationFields();

    const { count } = await getClient().userInvitation.updateMany({
      where: { membershipId, status: { not: "ACCEPTED" }, acceptedAt: null },
      data: { ...fields, status: "INVITED", invitedBy },
    });

    if (count !== 1) throw new Conflict("Esta persona ya es miembro.");

    return fields;
  }

  private freshInvitationFields() {
    return {
      token: randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    };
  }

  async execute(data: InviteUserDto) {
    await this.tx.runInTransaction(async () => {
      const client = getClient();

      const resource = await this.findInvitationResource(data);

      let user = await client.user.findUnique({ where: { email: data.email } });

      if (user && user.accountId !== data.accountId) {
        throw new UnprocessableEntity(
          "Ya existe una cuenta con este correo en otra cuenta",
        );
      }

      if (!user)
        user = await client.user.create({
          data: {
            email: data.email,
            name: data.name,
            lastName: data.lastName,
            phone: data.phone,
            accountId: data.accountId,
          },
        });

      const existingMembership = await this.findMembershipWithInvitation(
        user.id,
        data.resourceId,
      );

      const invitation = existingMembership
        ? await this.renewExistingInvitation(existingMembership, data.createdBy)
        : await this.createMembershipWithInvitation(data, user.id);

      const url = `${process.env.FRONTEND_URL}/invite/accept?token=${invitation.token}`;

      const html = await renderTemplate("invite-user", {
        inviteUrl: url,
        name: `${user.name} ${user.lastName}`,
        resourceName: resource.name,
      });

      // Dentro de la transacción: si el correo falla, no queda una membership que impida reintentar.
      await this.services.emailService.send({
        html,
        subject: "WizyDoc - Invitación",
        to: user.email,
      });
    });
  }
}
