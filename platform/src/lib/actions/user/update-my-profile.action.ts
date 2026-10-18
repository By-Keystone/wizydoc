"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { tags } from "@/lib/api/user";
import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const updateMyProfileSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresa tu nombre" }),
  lastName: z.string().trim().min(1, { error: "Ingresa tu apellido" }),
  phone: z.string().trim().min(1, { error: "Ingresa tu celular" }),
  treatment: z.enum(["DR", "DRA"]).nullable().optional(),
});

export type UpdateMyProfileFields = z.infer<typeof updateMyProfileSchema> &
  Record<string, unknown>;

export async function updateMyProfileAction(
  _prevState: ActionState<UpdateMyProfileFields>,
  data: FormData,
): Promise<ActionState<UpdateMyProfileFields>> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const fields: Record<string, unknown> = {
    name: data.get("name"),
    lastName: data.get("lastName"),
    phone: data.get("phone"),
  };

  // El tratamiento solo viaja si el formulario lo pintó: quien no atiende en
  // ninguna sede no lo tiene y reenviarlo haría fallar todo el guardado.
  if (data.has("treatment")) {
    const treatment = data.get("treatment");
    fields.treatment = treatment === "" ? null : treatment;
  }

  const parsed = updateMyProfileSchema.safeParse(fields);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los datos marcados.",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    await doFetchJson("/user/me/profile", {
      method: "PATCH",
      body: JSON.stringify(parsed.data),
    });

    revalidateTag(tags.myProfile());

    return { status: "success", message: "Guardamos tus datos." };
  } catch (error) {
    return toActionState(error);
  }
}
