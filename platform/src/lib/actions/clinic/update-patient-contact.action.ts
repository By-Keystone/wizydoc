"use server";

import { tags } from "@/lib/api/clinic";
import { ApiError } from "@/lib/api/errors";
import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const updatePatientContactSchema = z.object({
  patientContact: z.string().trim(),
});

export type UpdatePatientContactFields = z.infer<
  typeof updatePatientContactSchema
> &
  Record<string, unknown>;

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;

export async function updatePatientContactAction(
  clinicId: string,
  _prevState: ActionState<UpdatePatientContactFields>,
  data: FormData,
): Promise<ActionState<UpdatePatientContactFields>> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = updatePatientContactSchema.safeParse({
    patientContact: data.get("patientContact") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa el número.",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  const patientContact = parsed.data.patientContact || null;

  try {
    await doFetchJson(`/clinic/${clinicId}/patient-contact`, {
      method: "PUT",
      body: JSON.stringify({ patientContact }),
    });

    revalidateTag(tags.bookingUsage(clinicId));

    return {
      status: "success",
      message: patientContact
        ? "Guardamos el número para tus pacientes."
        : "Quitamos el número.",
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_FORBIDDEN) {
      return {
        status: "error",
        message: "Solo un administrador puede cambiar este número.",
      };
    }
    if (error instanceof ApiError && error.status === HTTP_BAD_REQUEST) {
      return {
        status: "error",
        message: error.message,
        fieldErrors: { patientContact: { errors: [error.message] } },
      };
    }
    return toActionState(error);
  }
}
