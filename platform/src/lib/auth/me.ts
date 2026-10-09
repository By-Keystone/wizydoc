import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { forwardedHeaders } from "@/lib/api/fetch";
import { ApiError } from "@/lib/api/errors";

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

const TOO_MANY_REQUESTS_MESSAGE = "Demasiadas solicitudes. Espera un momento.";

async function fetchMe(): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}/user/me`, {
      headers: await forwardedHeaders(),
    });
  } catch {
    return null;
  }
}

/**
 * Perfil del usuario autenticado (incluye flags mutables como onboarding/isDoctor).
 * Autentica reenviando la cookie de sesión de Better Auth al api.
 * Cacheado por request via React `cache()`.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  const cookie = (await headers()).get("cookie") ?? "";
  if (!cookie) return null;

  const response = await fetchMe();
  if (response?.status === 429) {
    throw new ApiError(429, TOO_MANY_REQUESTS_MESSAGE);
  }
  if (!response?.ok) return null;

  try {
    return (await response.json()) as Me;
  } catch {
    return null;
  }
});
