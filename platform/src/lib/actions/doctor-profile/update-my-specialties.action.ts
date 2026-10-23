"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { doFetchJson } from "@/lib/api/fetch";
import { tags } from "@/lib/api/user";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z from "zod";

const updateMySpecialtiesSchema = z.object({
  specialtyIds: z.array(z.uuid()).max(50),
});

export async function updateMySpecialtiesAction(
  organizationId: string,
  clinicId: string,
  _prevState: ActionState,
  data: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = updateMySpecialtiesSchema.safeParse({
    specialtyIds: data.getAll("specialtyIds"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Revisa las especialidades elegidas." };
  }

  try {
    await doFetchJson(
      `/organization/${encodeURIComponent(organizationId)}/clinics/${encodeURIComponent(clinicId)}/me/specialties`,
      { method: "PUT", body: JSON.stringify(parsed.data) },
    );

    revalidateTag(tags.myProfile());

    return { status: "success", message: "Guardamos tus especialidades." };
  } catch (error) {
    return toActionState(error);
  }
}
