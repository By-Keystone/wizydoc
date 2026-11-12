import type { ULID } from "ulid";
import { z } from "zod";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "../../../domain/user.entity";
import { emailSchema } from "../../../domain/value-objects/email.vo";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../../domain/value-objects/person-name.vo";
import { phoneSchema } from "../../../domain/value-objects/phone.vo";
import {
  type TreatmentVO,
  treatmentSchema,
} from "../../../domain/value-objects/treatment.vo";

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
  GivenName?: string;
  FamilyName?: string;
  Phone?: string;
  Treatment?: TreatmentVO | null;
  OnboardingCompletedAt?: string;
}

export const userIdSchema = z.ulid();

export const userItemSchema = z.object({
  Id: userIdSchema,
  Email: emailSchema,
  Confirmed: z.boolean(),
  AccountId: z.ulid(),
  OnboardingStep: z.enum(ONBOARDING_STEPS),
  CognitoSub: z.string().min(1).optional(),
  GivenName: givenNameSchema.optional(),
  FamilyName: familyNameSchema.optional(),
  Phone: phoneSchema.optional(),
  Treatment: treatmentSchema.nullable().optional(),
});

export const pk = (id: string): PK => `USER#${id}`;
export const sk = (): SK => "!";

export const gsi1pk = (email: string): GSI1PK => `USER_EMAIL#${email}`;
export const gsi1sk = (): GSI1SK => "!";

export const gsi2pk = (sub: string): GSI2PK => `COGNITO#${sub}`;
export const gsi2sk = (): GSI2SK => "!";
