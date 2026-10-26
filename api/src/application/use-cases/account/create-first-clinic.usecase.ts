import { Conflict } from "@/application/errors/conflict.error";
import { Forbidden } from "@/application/errors/forbidden.error";
import type { IClinicRepository } from "@/domain/repositories/clinic.repository";
import type { IMembershipRepository } from "@/domain/repositories/membership.repository";
import type { IOrganizationRepository } from "@/domain/repositories/organization.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { lockAccountQuota } from "@/infrastructure/postgres/lock-account-quota";
import { liveDoctorProfileWhere } from "@/infrastructure/postgres/queries/doctor-profile/live-doctor-profile";
import { MembershipRepository } from "@/infrastructure/postgres/repositories/membership.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;
const MAX_SPECIALTY_LENGTH = 100;

// La columna es NOT NULL y el onboarding no pide teléfono.
const CLINIC_WITHOUT_PHONE = "";

function requiredText(
  maxLength: number,
  messages: { required: string; tooLong: string },
) {
  return z
    .string({ error: messages.required })
    .trim()
    .min(1, { error: messages.required })
    .max(maxLength, { error: messages.tooLong });
}

export const createFirstClinicSchema = z.strictObject({
  name: requiredText(MAX_NAME_LENGTH, {
    required: "Escribe el nombre de tu consultorio.",
    tooLong: `El nombre del consultorio no puede tener más de ${MAX_NAME_LENGTH} caracteres.`,
  }),
  address: requiredText(MAX_ADDRESS_LENGTH, {
    required: "Escribe la dirección de tu consultorio.",
    tooLong: `La dirección no puede tener más de ${MAX_ADDRESS_LENGTH} caracteres.`,
  }),
  specialty: requiredText(MAX_SPECIALTY_LENGTH, {
    required: "Escribe tu especialidad.",
    tooLong: `La especialidad no puede tener más de ${MAX_SPECIALTY_LENGTH} caracteres.`,
  }),
});

export type CreateFirstClinicDto = z.infer<typeof createFirstClinicSchema> & {
  userId: string;
  accountId: string;
};

export class CreateFirstClinicUseCase {
  constructor(
    private readonly organizations: IOrganizationRepository,
    private readonly clinics: IClinicRepository,
    private readonly tx: ITransactionManager,
    private readonly memberships: IMembershipRepository = new MembershipRepository(),
  ) {}

  async execute(dto: CreateFirstClinicDto) {
    return this.tx.runInTransaction(async () => {
      await this.lockAccount(dto.accountId);
      await lockAccountQuota(dto.accountId);
      await this.assertOwnerWithoutOrganizations(dto);

      const organization = await this.organizations.save({
        name: dto.name,
        userId: dto.userId,
        accountId: dto.accountId,
      });
      const clinic = await this.clinics.save({
        name: dto.name,
        address: dto.address,
        phone: CLINIC_WITHOUT_PHONE,
        createdBy: dto.userId,
        accountId: dto.accountId,
        organizationId: organization.resourceId,
      });
      await this.memberships.grantAttending({
        userId: dto.userId,
        clinicId: clinic.resourceId,
        accountId: dto.accountId,
        createdBy: dto.userId,
      });
      await this.createOwnerSpecialty(
        dto,
        organization.resourceId,
        clinic.resourceId,
      );

      return {
        organizationId: organization.resourceId,
        clinicId: clinic.resourceId,
      };
    });
  }

  // subscription es opcional en el schema: sin ella lockAccountQuota no bloquea nada.
  private async lockAccount(accountId: string) {
    await getClient().$queryRaw`
      SELECT 1 FROM account WHERE id = ${accountId}::uuid FOR NO KEY UPDATE
    `;
  }

  private async assertOwnerWithoutOrganizations(dto: CreateFirstClinicDto) {
    const account = await getClient().account.findUnique({
      where: { id: dto.accountId },
      select: { ownerId: true, _count: { select: { organizations: true } } },
    });

    if (account?.ownerId !== dto.userId) {
      throw new Forbidden(
        "Sólo el dueño de la cuenta puede crear su consultorio",
      );
    }
    if (account._count.organizations > 0) {
      throw new Conflict("Tu consultorio ya está creado");
    }
  }

  private async createOwnerSpecialty(
    dto: CreateFirstClinicDto,
    organizationId: string,
    clinicId: string,
  ) {
    const client = getClient();
    const profile = await client.doctorProfile.findFirstOrThrow({
      where: liveDoctorProfileWhere({
        userId: dto.userId,
        clinicId,
        accountId: dto.accountId,
      }),
      select: { id: true },
    });

    await client.doctorProfile.update({
      where: { id: profile.id },
      data: {
        specialties: { create: { name: dto.specialty, organizationId } },
      },
    });
  }
}
