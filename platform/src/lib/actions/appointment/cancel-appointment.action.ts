"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { DataActionState } from "@/lib/actions/types";
import { appointmentsApi } from "@/lib/api/appointments";
import type { AppointmentPortal } from "@/lib/api/appointments/types";

export async function cancelAppointmentAction(
  token: string,
  expectedScheduledAt: string,
): Promise<DataActionState<AppointmentPortal>> {
  try {
    const data = await appointmentsApi.cancel(token, expectedScheduledAt);
    return { status: "success", data };
  } catch (error) {
    return toActionState(error);
  }
}
