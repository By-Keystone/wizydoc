import { type ULID, ulid } from "ulid";
import type { Account } from "./account.entity";
import type { EmailVO } from "./value-objects/email.vo";

export const ONBOARDING_STEPS = [
  "PERSONAL_DATA",
  "PLAN",
  "CLINIC",
  "SCHEDULE",
  "COMPLETED",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface User {
  id: ULID;
  email: EmailVO;
  confirmed: boolean;
  accountId: ULID;
  onboardingStep: OnboardingStep;
  cognitoSub?: string;
}

export interface UserWithAccount {
  user: User;
  account: Account;
}

export interface CreateUserWithAccountInput {
  email: EmailVO;
  cognitoSub: string;
}

export const createUserWithAccount = (
  { email, cognitoSub }: CreateUserWithAccountInput,
  now = new Date(),
): UserWithAccount => {
  const userId = ulid();
  const accountId = ulid();
  return {
    user: {
      id: userId,
      email,
      cognitoSub,
      confirmed: true,
      accountId,
      onboardingStep: "PERSONAL_DATA",
    },
    account: { id: accountId, ownerUserId: userId, createdAt: now },
  };
};
