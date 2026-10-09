"use server";

import { doFetchJson } from "@/lib/api/fetch";

export type LookedUpUser = {
  name: string;
  lastName: string;
  phone: string;
};

// Búsqueda "suave": cualquier fallo (no encontrado, error) devuelve null.
async function lookupUser(
  resourcePath: string,
  email: string,
): Promise<LookedUpUser | null> {
  if (!email) return null;

  try {
    const data = await doFetchJson<{ user: LookedUpUser | null }>(
      `${resourcePath}/users/lookup`,
      { method: "POST", body: JSON.stringify({ email }) },
    );

    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function lookupUserByEmailAction(
  clinicId: string,
  email: string,
): Promise<LookedUpUser | null> {
  return lookupUser(`/clinic/${encodeURIComponent(clinicId)}`, email);
}

export async function lookupOrganizationUserByEmailAction(
  organizationId: string,
  email: string,
): Promise<LookedUpUser | null> {
  return lookupUser(
    `/organization/${encodeURIComponent(organizationId)}`,
    email,
  );
}
