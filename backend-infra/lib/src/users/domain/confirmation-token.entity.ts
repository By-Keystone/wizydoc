import { createHash, randomBytes } from "node:crypto";
import type { ULID } from "ulid";

const CONFIRMATION_TOKEN_BYTES = 32;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export const CONFIRMATION_TOKEN_LIFETIME_HOURS = 24;

export interface ConfirmationToken {
  token: string;
  tokenHash: string;
  userId: ULID;
  expiresAt: Date;
}

export const hashConfirmationToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createConfirmationToken = (
  userId: ULID,
  now = new Date(),
): ConfirmationToken => {
  const token = randomBytes(CONFIRMATION_TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashConfirmationToken(token),
    userId,
    expiresAt: new Date(
      now.getTime() + CONFIRMATION_TOKEN_LIFETIME_HOURS * MILLISECONDS_PER_HOUR,
    ),
  };
};
