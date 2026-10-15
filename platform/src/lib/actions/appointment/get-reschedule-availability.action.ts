"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { DataActionState } from "@/lib/actions/types";
import { appointmentsApi } from "@/lib/api/appointments";

export async function getRescheduleAvailabilityAction(
  token: string,
): Promise<DataActionState<boolean>> {
  try {
    const { hasSlots } = await appointmentsApi.hasRescheduleSlots(token);
    return { status: "success", data: hasSlots };
  } catch (error) {
    return toActionState(error);
  }
}
