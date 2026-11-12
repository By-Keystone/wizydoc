import type { ULID } from "ulid";
import { z } from "zod";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "../../../domain/user.entity";
import { emailSchema } from "../../../domain/value-objects/email.vo";

type PKPrefix = "USER#";
type PK = `${PKPrefix}${string}`;

type SK = "!";

type GSI1PKPrefix = "USER_EMAIL#";
type GSI1PK = `${GSI1PKPrefix}${string}`;

type GSI1SK = "!";

type GSI2PKPrefix = "COGNITO#";
type GSI2PK = `${GSI2PKPrefix}${string}`;

type GSI2SK = "!";

export const USER_ITEM_TYPE = "USER";

export interface UsersDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof USER_ITEM_TYPE;
  GSI1PK: GSI1PK;
  GSI1SK: GSI1SK;
  GSI2PK?: GSI2PK;
  GSI2SK?: GSI2SK;
  Id: ULID;
  Email: string;
  Confirmed: boolean;
  AccountId: ULID;
  OnboardingStep: OnboardingStep;
  CognitoSub?: string;
}

export const userIdSchema = z.ulid();

export const userItemSchema = z.object({
  Id: userIdSchema,
  Email: emailSchema,
  Confirmed: z.boolean(),
  AccountId: z.ulid(),
  OnboardingStep: z.enum(ONBOARDING_STEPS),
  CognitoSub: z.string().min(1).optional(),
});

export const pk = (id: string): PK => `USER#${id}`;
export const sk = (): SK => "!";

export const gsi1pk = (email: string): GSI1PK => `USER_EMAIL#${email}`;
export const gsi1sk = (): GSI1SK => "!";

export const gsi2pk = (sub: string): GSI2PK => `COGNITO#${sub}`;
export const gsi2sk = (): GSI2SK => "!";
