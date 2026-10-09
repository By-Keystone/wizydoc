import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { forwardedHeaders } from "@/lib/api/fetch";
import { ApiError } from "@/lib/api/errors";

const API_URL = process.env.API_URL;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  lastName: string;
  phone: string;
  role: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  accountId: string | null;
  image: string | null;
}

const TOO_MANY_REQUESTS_MESSAGE = "Demasiadas solicitudes. Espera un momento.";

async function fetchSession(): Promise<Response | null> {
  try {
    return await fetch(`${API_URL}/api/auth/get-session`, {
      headers: await forwardedHeaders(),
    });
  } catch {
    return null;
  }
}

/**
 * Lee la sesión de Better Auth desde el server reenviando la cookie al api.
 * Cacheado por request con React `cache()`.
 */
export const getSession = cache(
  async (): Promise<{ user: SessionUser } | null> => {
    const cookie = (await headers()).get("cookie") ?? "";
    if (!cookie) return null;

    const res = await fetchSession();
    if (res?.status === 429) throw new ApiError(429, TOO_MANY_REQUESTS_MESSAGE);
    if (!res?.ok) return null;

    try {
      const data = await res.json();
      if (!data?.user) return null;

      return data as { user: SessionUser };
    } catch {
      return null;
    }
  },
);
