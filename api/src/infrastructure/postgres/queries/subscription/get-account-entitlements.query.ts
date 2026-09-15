import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import {
  type Entitlements,
  entitlementsFor,
} from "@/domain/entities/subscription/entitlements";
import { getClient } from "../../transaction-context";

export class GetAccountEntitlements implements IGetAccountEntitlements {
  async execute(accountId: string): Promise<Entitlements> {
    const subscription = await getClient().subscription.findUnique({
      where: { accountId },
      select: {
        plan: true,
        status: true,
        extraDoctors: true,
        extraClinics: true,
      },
    });

    return entitlementsFor(subscription);
  }
}
