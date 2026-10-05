import type { Subscription } from "@/domain/entities/subscription/entity";
import type { Subscription as PrismaSubscription } from "@prisma/client";

export function toDomain(subscription: PrismaSubscription): Subscription {
  return {
    id: subscription.id,
    status: subscription.status,
    plan: subscription.plan,
  };
}
