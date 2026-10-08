"use server";

import { tags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
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
    specialtyIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    message: "Selecciona al menos una especialidad",
    path: ["specialtyIds"],
  });

export type InviteUserState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          keyof z.infer<typeof inviteUserSchema>,
          { errors: string[] } | undefined
        >
      >;
    }
  | { status: "success" }
  | { status: "auth-expired" };

export async function inviteUserAction(
  clinicId: string,
  _prevState: InviteUserState,
  data: FormData,
): Promise<InviteUserState> {
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
    await doFetchJson(`/clinic/${clinicId}/invitations`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });

    revalidateTag(tags.clinicUsers(clinicId));
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
