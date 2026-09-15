import type { Entitlements } from "@/domain/entities/subscription/entitlements";

export interface IGetAccountEntitlements {
  execute(accountId: string): Promise<Entitlements>;
}
