import type { ULID } from "ulid";

export const PLANS = ["FREE", "CONSULTORIO", "CLINICA", "RED"] as const;

export type Plan = (typeof PLANS)[number];

export const BETA_PLAN: Plan = "FREE";

export interface Subscription {
  accountId: ULID;
  plan: Plan;
  createdAt: Date;
}

export interface CreateSubscriptionInput {
  accountId: ULID;
  plan: Plan;
}

export const createSubscription = (
  input: CreateSubscriptionInput,
  now = new Date(),
): Subscription => ({ ...input, createdAt: now });
