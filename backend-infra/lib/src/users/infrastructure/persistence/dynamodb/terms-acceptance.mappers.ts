import type { TermsAcceptance } from "../../../domain/terms-acceptance.entity";
import {
  TERMS_ACCEPTANCE_ITEM_TYPE,
  type TermsAcceptanceDynamoDBSchema,
  termsAcceptanceSk,
} from "./terms-acceptance.schema";
import { pk } from "./user.schema";

export const fromTermsAcceptanceToDynamo = (
  termsAcceptance: TermsAcceptance,
): TermsAcceptanceDynamoDBSchema => ({
  PK: pk(termsAcceptance.userId),
  SK: termsAcceptanceSk(termsAcceptance.acceptedAt),
  ItemType: TERMS_ACCEPTANCE_ITEM_TYPE,
  Email: termsAcceptance.email,
  TermsVersion: termsAcceptance.termsVersion,
  PrivacyPolicyVersion: termsAcceptance.privacyPolicyVersion,
  CheckboxTextVersion: termsAcceptance.checkboxTextVersion,
  AcceptedAt: termsAcceptance.acceptedAt.toISOString(),
  IpAddress: termsAcceptance.ipAddress,
  UserAgent: termsAcceptance.userAgent,
  Source: termsAcceptance.source,
});
