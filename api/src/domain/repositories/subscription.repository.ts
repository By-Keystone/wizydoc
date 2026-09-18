import { Plan, SubscriptionStatus } from "@prisma/client";
import { Subscription } from "../entities/subscription/entity";

export interface PaymentProviderIds {
  customerId: string;
  cardId: string;
  subscriptionId: string;
}

export interface CreateSubscriptionDto {
  accountId: string;
  status: SubscriptionStatus;
  plan: Plan;
  paymentProvider?: PaymentProviderIds;
}

export interface ISubscriptionRepository {
  save(dto: CreateSubscriptionDto): Promise<Subscription>;
}
