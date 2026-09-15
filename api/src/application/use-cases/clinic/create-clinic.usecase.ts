import { PaymentRequired } from "@/application/errors/payment-required.error";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import { IClinicRepository } from "@/domain/repositories/clinic.repository";
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
  organizationId: z.string(),
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

  async execute(dto: CreateClinicDto) {
    return inTransaction(async () => {
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
