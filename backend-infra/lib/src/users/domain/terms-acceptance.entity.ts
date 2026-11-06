import type { ULID } from "ulid";
import {
  CURRENT_CHECKBOX_TEXT_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "./legal-documents";
import type { EmailVO } from "./value-objects/email.vo";

const MAX_USER_AGENT_LENGTH = 512;

export interface TermsAcceptance {
  userId: ULID;
  email: EmailVO;
  termsVersion: string;
  privacyPolicyVersion: string;
  checkboxTextVersion: string;
  acceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  source: "sign-up";
}

export interface CreateTermsAcceptanceInput {
  userId: ULID;
  email: EmailVO;
  ipAddress?: string;
  userAgent?: string;
}

export const createTermsAcceptance = (
  input: CreateTermsAcceptanceInput,
  now = new Date(),
): TermsAcceptance => ({
  ...input,
  userAgent: input.userAgent?.slice(0, MAX_USER_AGENT_LENGTH),
  termsVersion: CURRENT_TERMS_VERSION,
  privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
  checkboxTextVersion: CURRENT_CHECKBOX_TEXT_VERSION,
  acceptedAt: now,
  source: "sign-up",
});
