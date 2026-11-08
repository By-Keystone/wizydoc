import "server-only";

import type { CognitoTokens } from "@/lib/api/sign-up/types";
import { COOKIE_NAMES } from "@/lib/auth/cookies";
import { cookies } from "next/headers";

// Copia REFRESH_TOKEN_VALIDITY de backend-infra/lib/authentication.ts.
const REFRESH_TOKEN_LIFETIME_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

export async function saveCognitoSession(tokens: CognitoTokens): Promise<void> {
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  } as const;

  cookieStore.set(COOKIE_NAMES.idToken, tokens.idToken, {
    ...options,
    maxAge: tokens.expiresIn,
  });
  cookieStore.set(COOKIE_NAMES.accessToken, tokens.accessToken, {
    ...options,
    maxAge: tokens.expiresIn,
  });
  cookieStore.set(COOKIE_NAMES.refreshToken, tokens.refreshToken, {
    ...options,
    maxAge: REFRESH_TOKEN_LIFETIME_DAYS * SECONDS_PER_DAY,
  });
}
