"use server";

import z from "zod";
import { doFetchJson } from "@/lib/api/fetch";
import type { ManagedAppointment } from "@/lib/api/appointments/types";
import { isManageTokenFormat } from "@/lib/api/appointments/manage-token";
import {
  LINK_UNAVAILABLE_RESULT,
  type ManageAppointmentResult,
  toManageAppointmentError,
} from "./manage-appointment-result";

const scheduledAtSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
  error: "Elige un horario válido",
});

export async function rescheduleAppointmentAction(
  token: string,
  scheduledAt: string,
  expectedScheduledAt: string,
): Promise<ManageAppointmentResult> {
  if (!isManageTokenFormat(token)) return LINK_UNAVAILABLE_RESULT;

  const parsed = scheduledAtSchema.safeParse(scheduledAt);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  try {
    const appointment = await doFetchJson<ManagedAppointment>(
      `/appointment/manage/${encodeURIComponent(token)}/reschedule`,
      {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: parsed.data,
          expectedScheduledAt,
        }),
      },
    );
    return { status: "success", appointment };
  } catch (error) {
    return toManageAppointmentError(error);
  }
}
