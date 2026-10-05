"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import { tags } from "@/lib/api/availability";
import type { AvailabilityBlock } from "@/lib/api/availability/types";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";

export type SaveAvailabilityState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "auth-expired" };

/**
 * Reemplaza toda la disponibilidad del doctor autenticado en una clínica
 * (replace-all). El backend resuelve el doctor por la sesión + el clinicId.
 */
export async function saveAvailability(
  clinicId: string,
  blocks: AvailabilityBlock[],
): Promise<SaveAvailabilityState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  try {
    await doFetchJson(`/clinic/${clinicId}/availability`, {
      method: "PUT",
      body: JSON.stringify({ availabilities: blocks }),
    });

    revalidateTag(tags.clinicAvailability(clinicId));
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
