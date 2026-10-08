import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import { PaymentRequired } from "@/application/errors/payment-required.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import type { IEmailService } from "@/application/ports/email-service.port";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { lockAccountQuota } from "@/infrastructure/postgres/lock-account-quota";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import { MembershipRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
import z from "zod";

export const inviteUserSchema = z
  .object({
    // Better Auth busca al usuario en minúsculas al iniciar sesión.
    email: z.email({ error: "Correo inválido" }).toLowerCase(),
    name: z.string("Name is required"),
    lastName: z.string("Lastname is required"),
    phone: z.string("Phone is required"),
    role: z.enum(MembershipRole, { error: "Membership role is required" }),
    resourceId: z.string("Resource ID is required"),
    specialtyIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    message: "At least one specialty is required for a doctor",
    path: ["specialtyIds"],
  });

export type InviteUserDto = z.infer<typeof inviteUserSchema> & {
  createdBy: string;
  accountId: string;
};

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

  private async assertInviterIsAdmin(
    createdBy: string,
    accountId: string,
    clinicResourceId: string,
    organizationResourceId: string | null,
  ) {
    const resourceIds = organizationResourceId
      ? [clinicResourceId, organizationResourceId]
      : [clinicResourceId];

    const membership = await getClient().userResourceMembership.findFirst({
      where: {
        userId: createdBy,
        accountId,
        deletedAt: null,
        role: "ADMIN",
        resourceId: { in: resourceIds },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new Forbidden(
        "Sólo un administrador de la sede puede invitar usuarios",
      );
    }
  }

  async execute(data: InviteUserDto) {
    await this.tx.runInTransaction(async () => {
      const client = getClient();

      // El recurso llega en el cuerpo de la petición, así que se acota a la
      // cuenta del invitador: sin este filtro se podría invitar gente a una
      // clínica de otra cuenta.
      const resource = await client.clinic.findFirst({
        where: {
          resourceId: data.resourceId,
          resource: { accountId: data.accountId },
        },
        include: { resource: { select: { parentResourceId: true } } },
      });

      if (!resource) {
        throw new NotFound("Sede no encontrada");
      }

      await this.assertInviterIsAdmin(
        data.createdBy,
        data.accountId,
        data.resourceId,
        resource.resource.parentResourceId,
      );

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

      if (data.role === "DOCTOR") {
        await this.assertDoctorSeatAvailable(data.accountId, user.id);
        const uniqueSpecialtyIds =
          await this.assertSpecialtiesBelongToClinicOrganization(
            data.resourceId,
            data.specialtyIds ?? [],
          );

        await client.doctorProfile.create({
          data: {
            userId: user.id,
            clinicId: resource.resourceId,
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
          userId: user.id,
          resourceId: data.resourceId,
          createdBy: data.createdBy,
        },
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const invitationToken = randomBytes(32).toString("hex");

      const invitation = await client.userInvitation.create({
        data: {
          expiresAt,
          token: invitationToken,
          membershipId: membership.id,
          invitedBy: data.createdBy,
        },
      });

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
