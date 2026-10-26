"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { DataActionState } from "@/lib/actions/types";
import { isPlanFeatureError } from "@/lib/api/errors";
import { patientsApi } from "@/lib/api/patients";
import {
  type PatientsPage,
  SEARCH_MAX_CHARACTERS,
} from "@/lib/api/patients/types";
import z from "zod";

const listPatientsSchema = z.object({
  resourceId: z.uuid(),
  search: z.string().max(SEARCH_MAX_CHARACTERS).optional(),
  from: z.uuid().optional(),
});

export type ListPatientsResult =
  | DataActionState<PatientsPage>
  | { status: "plan-required" };

export async function listPatientsAction(
  input: z.input<typeof listPatientsSchema>,
): Promise<ListPatientsResult> {
  const parsed = listPatientsSchema.safeParse(input);

  if (!parsed.success) {
    return { status: "error", message: "Revisa los datos de la búsqueda" };
  }

  const { resourceId, search, from } = parsed.data;

  try {
    const page = search
      ? await patientsApi.searchPatients({ resourceId, search, from })
      : await patientsApi.getPatients({ resourceId, from });

    return { status: "success", data: page };
  } catch (error) {
    if (isPlanFeatureError(error)) return { status: "plan-required" };

    return toActionState(error);
  }
}
