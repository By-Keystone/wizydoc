import { createHash, randomBytes } from "node:crypto";

const ACCESS_TOKEN_BYTES = 32;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString("base64url");
}

export function isAccessTokenFormat(token: string): boolean {
  return ACCESS_TOKEN_PATTERN.test(token);
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
