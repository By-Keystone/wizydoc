"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { tags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { tags as userTags } from "@/lib/api/user";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z from "zod";

const updateDoctorSpecialtiesSchema = z.object({
  specialtyIds: z.array(z.uuid()).max(50),
});

export async function updateDoctorSpecialtiesAction(
  organizationId: string,
  clinicId: string,
  doctorProfileId: string,
  _prevState: ActionState,
  data: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = updateDoctorSpecialtiesSchema.safeParse({
    specialtyIds: data.getAll("specialtyIds"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Revisa las especialidades elegidas." };
  }

  try {
    await doFetchJson(
      `/organization/${encodeURIComponent(organizationId)}/clinics/${encodeURIComponent(clinicId)}/doctors/${encodeURIComponent(doctorProfileId)}/specialties`,
      { method: "PUT", body: JSON.stringify(parsed.data) },
    );

    revalidateTag(tags.clinicUsers(clinicId));
    revalidateTag(userTags.myProfile());

    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
