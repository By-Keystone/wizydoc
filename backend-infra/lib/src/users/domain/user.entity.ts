import { ulid, type ULID } from "ulid";
import type { EmailVO } from "./value-objects/email.vo";
import type { TreatmentVO } from "./value-objects/treatment.vo";

export interface User {
  id: ULID;
  email: EmailVO;
  name?: string;
  lastName?: string;
  phone?: string;
  confirmed: boolean;
  treatment?: TreatmentVO;
  accountId?: ULID;
  onboardingCompleted: boolean;
  cognitoSub?: string;
}

export interface CreateUserInput {
  email: EmailVO;
  name?: string;
  lastName?: string;
  phone?: string;
  cognitoSub: string;
  confirmed: boolean;
  onboardingCompleted: boolean;
}

export const createUser = (input: CreateUserInput): User => ({
  ...input,
  id: ulid(),
});
