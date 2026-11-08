import { createHash, randomInt } from "node:crypto";
import type { EmailVO } from "./value-objects/email.vo";

const CODE_DIGITS = 6;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

export const SIGN_UP_CODE_LIFETIME_MINUTES = 10;
export const SIGN_UP_EMAIL_COOLDOWN_SECONDS = 60;
export const SIGN_UP_CODE_MAX_ATTEMPTS = 5;

export interface SignUpCode {
  code: string;
  codeHash: string;
  email: EmailVO;
  expiresAt: Date;
  attempts: number;
}

export const hashSignUpCode = (code: string): string =>
  createHash("sha256").update(code).digest("hex");

export const createSignUpCode = (
  email: EmailVO,
  now = new Date(),
): SignUpCode => {
  const code = String(randomInt(10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
  return {
    code,
    codeHash: hashSignUpCode(code),
    email,
    expiresAt: new Date(
      now.getTime() + SIGN_UP_CODE_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE,
    ),
    attempts: 0,
  };
};
