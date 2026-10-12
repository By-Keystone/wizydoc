"use server";

import { doFetchJson } from "@/lib/api/fetch";
import type { ManagedAppointment } from "@/lib/api/appointments/types";
import { isManageTokenFormat } from "@/lib/api/appointments/manage-token";
import {
  LINK_UNAVAILABLE_RESULT,
  type ManageAppointmentResult,
  toManageAppointmentError,
} from "./manage-appointment-result";

export async function cancelAppointmentAction(
  token: string,
  expectedScheduledAt: string,
): Promise<ManageAppointmentResult> {
  if (!isManageTokenFormat(token)) return LINK_UNAVAILABLE_RESULT;

  try {
    const appointment = await doFetchJson<ManagedAppointment>(
      `/appointment/manage/${encodeURIComponent(token)}/cancel`,
      { method: "POST", body: JSON.stringify({ expectedScheduledAt }) },
    );
    return { status: "success", appointment };
  } catch (error) {
    return toManageAppointmentError(error);
  }
}
