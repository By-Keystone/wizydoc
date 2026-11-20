import type { Subscription } from "../../../domain/subscription.entity";
import { accountPk } from "./account.schema";
import {
  SUBSCRIPTION_ITEM_TYPE,
  type SubscriptionDynamoDBSchema,
} from "./subscription.schema";

export const fromSubscriptionToDynamo = ({
  accountId,
  plan,
  createdAt,
}: Subscription): SubscriptionDynamoDBSchema => ({
  PK: accountPk(accountId),
  SK: "SUBSCRIPTION",
  ItemType: SUBSCRIPTION_ITEM_TYPE,
  Plan: plan,
  CreatedAt: createdAt.toISOString(),
  GSI1PK: `PLAN#${plan}`,
  GSI1SK: accountPk(accountId),
});
