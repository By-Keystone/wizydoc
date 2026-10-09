const MANAGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const isManageTokenFormat = (token: string) =>
  MANAGE_TOKEN_PATTERN.test(token);
