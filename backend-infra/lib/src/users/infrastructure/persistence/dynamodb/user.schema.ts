import type { ULID } from "ulid";
import type { OnboardingStep } from "../../../domain/user.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import type { PersonNameVO } from "../../../domain/value-objects/person-name.vo";
import type { PhoneVO } from "../../../domain/value-objects/phone.vo";
import type { TreatmentVO } from "../../../domain/value-objects/treatment.vo";

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
  Email: EmailVO;
  Confirmed: boolean;
  AccountId: ULID;
  OnboardingStep: OnboardingStep;
  CognitoSub?: string;
  GivenName?: PersonNameVO;
  FamilyName?: PersonNameVO;
  Phone?: PhoneVO;
  Treatment?: TreatmentVO | null;
  OnboardingCompletedAt?: string;
}

export const pk = (id: string): PK => `USER#${id}`;
export const sk = (): SK => "!";

export const gsi1pk = (email: string): GSI1PK => `USER_EMAIL#${email}`;
export const gsi1sk = (): GSI1SK => "!";

export const gsi2pk = (sub: string): GSI2PK => `COGNITO#${sub}`;
export const gsi2sk = (): GSI2SK => "!";
