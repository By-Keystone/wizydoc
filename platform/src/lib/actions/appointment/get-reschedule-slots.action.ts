"use server";

import { appointmentsApi } from "@/lib/api/appointments";
import type { DoctorSlots } from "@/lib/api/doctor-profile/types";

export async function getRescheduleSlotsAction(
  token: string,
  from: string,
  to: string,
): Promise<DoctorSlots> {
  return appointmentsApi.getRescheduleSlots(token, from, to);
}
