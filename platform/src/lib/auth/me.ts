import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

export interface Me {
  id: string;
  email: string;
  name: string;
  lastName: string;
  role: string;
  confirmed: boolean;
  onboardingCompleted: boolean;
  accountId: string | null;
  isAccountOwner: boolean;
}

const API_URL = process.env.API_URL;

/**
 * Perfil del usuario autenticado (incluye flags mutables como onboarding/isDoctor).
 * Autentica reenviando la cookie de sesión de Better Auth al api.
 * Cacheado por request via React `cache()`.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return null;

  try {
    const response = await fetch(`${API_URL}/user/me`, {
      headers: { cookie },
    });
    if (!response.ok) return null;
    return (await response.json()) as Me;
  } catch {
    return null;
  }
});
