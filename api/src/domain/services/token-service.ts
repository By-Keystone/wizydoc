import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${TOKEN_BYTES * 2}}$`);

export class TokenService {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString("hex");
  }

  isWellFormed(token: string): boolean {
    return TOKEN_PATTERN.test(token);
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
