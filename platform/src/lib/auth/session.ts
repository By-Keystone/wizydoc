import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

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

/**
 * Lee la sesión de Better Auth desde el server reenviando la cookie al api.
 * Cacheado por request con React `cache()`.
 */
export const getSession = cache(
  async (): Promise<{ user: SessionUser } | null> => {
    const cookie = (await headers()).get("cookie") ?? "";
    if (!cookie) return null;

    try {
      const res = await fetch(`${API_URL}/api/auth/get-session`, {
        headers: { cookie },
      });
      if (!res.ok) return null;

      const data = await res.json();
      if (!data?.user) return null;

      return data as { user: SessionUser };
    } catch {
      return null;
    }
  },
);
