import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import { PaymentRequired } from "@/application/errors/payment-required.error";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import type { IClinicRepository } from "@/domain/repositories/clinic.repository";
import { lockAccountQuota } from "@/infrastructure/postgres/lock-account-quota";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";

export const createClinicSchema = z.object({
  name: z.string("Name  s required"),
  phone: z.string(),
  address: z.string(),
  organizationId: z.uuid(),
});

export type CreateClinicDto = z.infer<typeof createClinicSchema> & {
  accountId: string;
  createdBy: string;
};

export class CreateClinicUseCase {
  constructor(
    private readonly clinicRepository: IClinicRepository,
    private readonly entitlementsQuery = new GetAccountEntitlements(),
  ) {}

  // La organización llega en el cuerpo: sin esto, un ADMIN de otra organización de la misma cuenta podría colgarle sedes a ésta.
  private async assertCanCreateClinic(dto: CreateClinicDto) {
    const organization = await getClient().organization.findFirst({
      where: { resourceId: dto.organizationId, accountId: dto.accountId },
      select: { resourceId: true },
    });

    if (!organization) throw new NotFound("Organización no encontrada");

    const adminMembership = await getClient().userResourceMembership.findFirst({
      where: {
        userId: dto.createdBy,
        accountId: dto.accountId,
        resourceId: dto.organizationId,
        role: "ADMIN",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!adminMembership)
      throw new Forbidden(
        "Sólo un administrador de la organización puede crear sedes",
      );
  }

  async execute(dto: CreateClinicDto) {
    return inTransaction(async () => {
      await this.assertCanCreateClinic(dto);

      await lockAccountQuota(dto.accountId);

      const entitlements = await this.entitlementsQuery.execute(dto.accountId);

      const clinics = await getClient().resource.count({
        where: { accountId: dto.accountId, type: "CLINIC" },
      });

      if (!isWithinLimit(entitlements.maxClinics, clinics)) {
        throw new PaymentRequired(
          `El plan ${entitlements.plan} incluye ${entitlements.maxClinics} sedes`,
        );
      }

      await this.clinicRepository.save(dto);
    });
  }
}
