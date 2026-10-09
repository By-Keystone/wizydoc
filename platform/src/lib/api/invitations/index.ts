import "server-only";

import { ApiError } from "../errors";
import { doFetchJson } from "../fetch";

/** Paso que el usuario debe seguir tras aceptar la invitación. */
export type InvitationStep = "set_password" | "login";

export interface InvitationDetails {
  name: string;
  resourceName: string;
  step: InvitationStep;
}

export type InvitationLookup =
  | { status: "valid"; invitation: InvitationDetails }
  | { status: "expired" }
  | { status: "invalid" };

const EXPIRED_INVITATION_STATUS = 410;

/**
 * Obtiene los detalles de una invitación por su token. No requiere sesión: el
 * token es la credencial.
 */
export async function getInvitation(token: string): Promise<InvitationLookup> {
  try {
    const { data } = await doFetchJson<{ data: InvitationDetails }>(
      `/invitations/${token}`,
      { cache: "no-store" },
    );
    return { status: "valid", invitation: data };
  } catch (error) {
    if (error instanceof ApiError && error.status === EXPIRED_INVITATION_STATUS)
      return { status: "expired" };
    return { status: "invalid" };
  }
}
