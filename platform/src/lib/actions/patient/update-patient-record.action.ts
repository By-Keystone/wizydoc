"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { tags } from "@/lib/api/patients";
import { toActionState } from "@/lib/actions/to-action-state";
import { ActionState } from "@/lib/actions/types";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const optionalText = z.string().nullable();

const updatePatientRecordSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  lastName: z.string().trim().min(1, "El apellido es requerido"),
  phone: z.string().trim().min(1, "El teléfono es requerido"),
  email: z.email("El email no es válido"),
  birthDate: z.iso.date("La fecha de nacimiento no es válida").nullable(),
  sex: optionalText,
  emergencyContact: optionalText,
  insurer: optionalText,
  bloodType: optionalText.optional(),
  allergies: z.array(z.string().trim().min(1)).optional(),
  background: optionalText.optional(),
  medications: optionalText.optional(),
  allergiesReviewed: z.boolean().optional(),
});

export type UpdatePatientRecordFields = z.infer<
  typeof updatePatientRecordSchema
> &
  Record<string, unknown>;

/** Un input vacío es "sin dato", no la cadena vacía. */
const orNull = (value: FormDataEntryValue | null) => {
  const text = typeof value === "string" ? value.trim() : "";

  return text === "" ? null : text;
};

export async function updatePatientRecordAction(
  patientId: string,
  _prevState: ActionState<UpdatePatientRecordFields>,
  data: FormData,
): Promise<ActionState<UpdatePatientRecordFields>> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const fields: Record<string, unknown> = {
    name: data.get("name"),
    lastName: data.get("lastName"),
    phone: data.get("phone"),
    email: data.get("email"),
    birthDate: orNull(data.get("birthDate")),
    sex: orNull(data.get("sex")),
    emergencyContact: orNull(data.get("emergencyContact")),
    insurer: orNull(data.get("insurer")),
  };

  // Los datos de salud solo viajan si el formulario los pintó. Quien no puede
  // editarlos no los envía, y así corregir un teléfono no se lleva un 403.
  if (data.has("healthEditable")) {
    fields.bloodType = orNull(data.get("bloodType"));
    fields.allergies = data.getAll("allergies").map(String);
    fields.background = orNull(data.get("background"));
    fields.medications = orNull(data.get("medications"));
    fields.allergiesReviewed = data.get("allergiesReviewed") === "on";
  }

  const parsed = updatePatientRecordSchema.safeParse(fields);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los datos del formulario",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    await doFetchJson(`/patients/${patientId}`, {
      method: "PATCH",
      body: JSON.stringify(parsed.data),
    });

    revalidateTag(tags.patient(patientId));

    return { status: "success", message: "Ficha actualizada" };
  } catch (error) {
    return toActionState(error);
  }
}
