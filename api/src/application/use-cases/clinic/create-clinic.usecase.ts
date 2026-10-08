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

export const createClinicBodySchema = z.object({
  name: z.string("Name  s required"),
  phone: z.string(),
  address: z.string(),
});

export const createClinicParamsSchema = z.object({
  resourceId: z.uuid(),
});

export type CreateClinicDto = z.infer<typeof createClinicBodySchema> & {
  organizationId: string;
  accountId: string;
  createdBy: string;
};

export class CreateClinicUseCase {
  constructor(
    private readonly clinicRepository: IClinicRepository,
    private readonly entitlementsQuery = new GetAccountEntitlements(),
  ) {}

  // La política también acepta el id de una sede donde el usuario es ADMIN: esto la rechaza como organización y acota por la cuenta de la sesión.
  private async assertOrganizationInAccount(dto: CreateClinicDto) {
    const organization = await getClient().organization.findFirst({
      where: { resourceId: dto.organizationId, accountId: dto.accountId },
      select: { resourceId: true },
    });

    if (!organization) throw new NotFound("Organización no encontrada");
  }

  async execute(dto: CreateClinicDto) {
    return inTransaction(async () => {
      await this.assertOrganizationInAccount(dto);

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
