import { type ULID, ulid } from "ulid";
import type { EmailVO } from "./value-objects/email.vo";

export interface User {
  id: ULID;
  email: EmailVO;
  confirmed: boolean;
  onboardingCompleted: boolean;
  cognitoSub?: string;
}

export interface CreateUserInput {
  email: EmailVO;
  cognitoSub: string;
  confirmed: boolean;
  onboardingCompleted: boolean;
}

export const createUser = (input: CreateUserInput): User => ({
  ...input,
  id: ulid(),
});
