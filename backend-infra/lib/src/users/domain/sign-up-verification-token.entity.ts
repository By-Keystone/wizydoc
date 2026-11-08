import { createHash, randomBytes } from "node:crypto";
import type { EmailVO } from "./value-objects/email.vo";

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_LIFETIME_MINUTES = 15;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

export interface SignUpVerificationToken {
  token: string;
  tokenHash: string;
  email: EmailVO;
  expiresAt: Date;
}

export const hashSignUpVerificationToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createSignUpVerificationToken = (
  email: EmailVO,
  now = new Date(),
): SignUpVerificationToken => {
  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashSignUpVerificationToken(token),
    email,
    expiresAt: new Date(
      now.getTime() +
        VERIFICATION_TOKEN_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE,
    ),
  };
};
