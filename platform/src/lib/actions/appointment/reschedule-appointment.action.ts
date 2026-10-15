"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { DataActionState } from "@/lib/actions/types";
import { appointmentsApi } from "@/lib/api/appointments";
import type { AppointmentPortal } from "@/lib/api/appointments/types";

export async function rescheduleAppointmentAction(
  token: string,
  scheduledAt: string,
  expectedScheduledAt: string,
): Promise<DataActionState<AppointmentPortal>> {
  try {
    const data = await appointmentsApi.reschedule(
      token,
      scheduledAt,
      expectedScheduledAt,
    );
    return { status: "success", data };
  } catch (error) {
    return toActionState(error);
  }
}
