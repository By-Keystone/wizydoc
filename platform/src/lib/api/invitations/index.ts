import "server-only";

import { doFetchJson } from "../fetch";

/** Paso que el usuario debe seguir tras aceptar la invitación. */
export type InvitationStep = "set_password" | "login";

export interface InvitationDetails {
  name: string;
  resourceName: string;
  step: InvitationStep;
}

/**
 * Obtiene los detalles de una invitación por su token. No requiere sesión: el
 * token es la credencial. Devuelve `null` si el token es inválido o expiró.
 */
export async function getInvitation(
  token: string,
): Promise<InvitationDetails | null> {
  try {
    const { data } = await doFetchJson<{ data: InvitationDetails }>(
      `/invitations/${token}`,
      { cache: "no-store" },
    );
    return data;
  } catch {
    return null;
  }
}
