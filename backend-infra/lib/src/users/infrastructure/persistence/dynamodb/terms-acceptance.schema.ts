type PK = `USER#${string}`;
type SK = `TERMS_ACCEPTANCE#${string}`;

export const TERMS_ACCEPTANCE_ITEM_TYPE = "TERMS_ACCEPTANCE";

export interface TermsAcceptanceDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof TERMS_ACCEPTANCE_ITEM_TYPE;
  Email: string;
  TermsVersion: string;
  PrivacyPolicyVersion: string;
  CheckboxTextVersion: string;
  AcceptedAt: string;
  IpAddress?: string;
  UserAgent?: string;
  Source: string;
}

export const termsAcceptanceSk = (acceptedAt: Date): SK =>
  `TERMS_ACCEPTANCE#${acceptedAt.toISOString()}`;
