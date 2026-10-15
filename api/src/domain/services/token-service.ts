import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${TOKEN_BYTES * 2}}$`);

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function isTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
