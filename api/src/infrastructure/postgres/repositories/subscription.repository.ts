import type {
  CreateSubscriptionDto,
  ISubscriptionRepository,
} from "@/domain/repositories/subscription.repository";
import type { Subscription } from "@/domain/entities/subscription/entity";
import { getClient } from "../transaction-context";
import { toDomain } from "@/infrastructure/mappers/subscription/mapper";

export class SubscriptionRepository implements ISubscriptionRepository {
  async save(dto: CreateSubscriptionDto): Promise<Subscription> {
    const created = await getClient().subscription.create({
      data: {
        accountId: dto.accountId,
        plan: dto.plan,
        status: dto.status,
        paymentProviderCustomerId: dto.paymentProvider?.customerId,
        paymentProviderCardId: dto.paymentProvider?.cardId,
        paymentProviderSubscriptionId: dto.paymentProvider?.subscriptionId,
      },
    });
    return toDomain(created);
  }
}
