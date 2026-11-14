import { type ULID, ulid } from "ulid";
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

export interface CreateUserInput {
  email: EmailVO;
  cognitoSub: string;
  accountId: ULID;
}

export const createUser = ({
  email,
  cognitoSub,
  accountId,
}: CreateUserInput): User => ({
  id: ulid(),
  email,
  cognitoSub,
  confirmed: true,
  accountId,
  onboardingStep: "PERSONAL_DATA",
});
