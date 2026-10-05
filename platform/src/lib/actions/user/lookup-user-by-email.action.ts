"use server";

import { doFetchJson } from "@/lib/api/fetch";

export type LookedUpUser = {
  name: string;
  lastName: string;
  phone: string;
};

export async function lookupUserByEmailAction(
  clinicId: string,
  email: string,
): Promise<LookedUpUser | null> {
  if (!email) return null;

  // Búsqueda "suave": cualquier fallo (no encontrado, error) devuelve null.
  try {
    const data = await doFetchJson<{ user: LookedUpUser | null }>(
      `/clinic/${encodeURIComponent(clinicId)}/users/lookup`,
      { method: "POST", body: JSON.stringify({ email }) },
    );

    return data.user ?? null;
  } catch {
    return null;
  }
}
