"use server";

import { doFetchJson } from "@/lib/api/fetch";

export type LookedUpClinicMembership = {
  clinicId: string;
  role: "ADMIN" | "DOCTOR" | "USER";
  specialties: { id: string; name: string }[];
};

export type LookedUpUser = {
  name: string;
  lastName: string;
  phone: string;
  isAccountOwner: boolean;
  organizationRole: "ADMIN" | "DOCTOR" | "USER" | null;
  clinics: LookedUpClinicMembership[];
};

// Búsqueda "suave": cualquier fallo (no encontrado, error) devuelve null.
export async function lookupOrganizationUserByEmailAction(
  organizationId: string,
  email: string,
): Promise<LookedUpUser | null> {
  if (!email) return null;

  try {
    const data = await doFetchJson<{ user: LookedUpUser | null }>(
      `/organization/${encodeURIComponent(organizationId)}/users/lookup`,
      { method: "POST", body: JSON.stringify({ email }) },
    );

    return data.user ?? null;
  } catch {
    return null;
  }
}
