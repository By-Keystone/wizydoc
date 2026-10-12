import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateAccessToken = () =>
  randomBytes(TOKEN_BYTES).toString("base64url");

export const isAccessTokenFormat = (token: string) => TOKEN_PATTERN.test(token);

export const hashAccessToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
