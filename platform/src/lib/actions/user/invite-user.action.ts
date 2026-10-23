"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { tags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { tags as membershipTags } from "@/lib/api/memberships";
import { tags as userTags } from "@/lib/api/user";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const inviteUserSchema = z
  .object({
    name: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    role: z.enum(["DOCTOR", "USER"]),
    specialtyIds: z.array(z.uuid()).max(50).optional(),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    message: "Selecciona al menos una especialidad",
    path: ["specialtyIds"],
  });

export async function inviteUserAction(
  clinicId: string,
  _prevState: ActionState,
  data: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = inviteUserSchema.safeParse({
    name: data.get("name"),
    lastName: data.get("lastName"),
    email: data.get("email"),
    phone: data.get("phone"),
    role: data.get("role"),
    specialtyIds: data.getAll("specialtyIds"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    const { message } = await doFetchJson<{ message: string }>(
      `/clinic/${encodeURIComponent(clinicId)}/invitations`,
      { method: "POST", body: JSON.stringify(parsed.data) },
    );

    revalidateTag(tags.clinicUsers(clinicId));
    revalidateTag(userTags.myProfile());
    revalidateTag(membershipTags.memberships());
    revalidateTag(membershipTags.membershipsForResource(clinicId));
    return { status: "success", message };
  } catch (error) {
    return toActionState(error);
  }
}
