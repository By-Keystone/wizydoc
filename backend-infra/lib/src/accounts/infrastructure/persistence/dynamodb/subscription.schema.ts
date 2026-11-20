import type { Plan } from "../../../domain/subscription.entity";

type PK = `ACCOUNT#${string}`;
type SK = "SUBSCRIPTION";

export const SUBSCRIPTION_ITEM_TYPE = "SUBSCRIPTION";

export interface SubscriptionDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof SUBSCRIPTION_ITEM_TYPE;
  Plan: Plan;
  CreatedAt: string;
  GSI1PK: `PLAN#${Plan}`;
  GSI1SK: PK;
}
