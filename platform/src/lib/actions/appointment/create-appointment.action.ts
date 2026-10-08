"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import type { CreateAppointmentInput } from "@/lib/api/appointments/types";

export async function createAppointmentAction(
  input: CreateAppointmentInput,
): Promise<ActionState> {
  try {
    await doFetchJson("/appointment", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
