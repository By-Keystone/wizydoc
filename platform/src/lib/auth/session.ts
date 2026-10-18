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
    const incoming = await headers();
    const cookie = incoming.get("cookie") ?? "";
    if (!cookie) return null;

    // Sin la IP, el límite de Better Auth agrupa el get-session de todos los
    // usuarios en un solo cupo. Es la misma x-real-ip del borde que el rewrite
    // ya reenvía al api; toda llamada futura del servidor a /api/auth/* debe
    // reenviarla igual.
    const realIp = incoming.get("x-real-ip");

    try {
      const res = await fetch(`${API_URL}/api/auth/get-session`, {
        headers: realIp ? { cookie, "x-real-ip": realIp } : { cookie },
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
