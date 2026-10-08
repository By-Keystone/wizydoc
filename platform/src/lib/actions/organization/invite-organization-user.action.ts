"use server";

import { tags } from "@/lib/api/organizations";
import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const inviteOrganizationUserSchema = z.object({
  name: z.string().min(1, "Ingresa el nombre"),
  lastName: z.string().min(1, "Ingresa el apellido"),
  email: z.string().email("Ingresa un correo electrónico válido"),
  phone: z.string().min(1, "Ingresa el teléfono"),
  role: z.enum(["ADMIN", "USER"], { error: "Elige un rol" }),
});

export type InviteOrganizationUserState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          keyof z.infer<typeof inviteOrganizationUserSchema>,
          { errors: string[] } | undefined
        >
      >;
    }
  | { status: "success" }
  | { status: "auth-expired" };

export async function inviteOrganizationUserAction(
  organizationId: string,
  _prevState: InviteOrganizationUserState,
  data: FormData,
): Promise<InviteOrganizationUserState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = inviteOrganizationUserSchema.safeParse({
    name: data.get("name"),
    lastName: data.get("lastName"),
    email: data.get("email"),
    phone: data.get("phone"),
    role: data.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    await doFetchJson(
      `/organization/${encodeURIComponent(organizationId)}/invitations`,
      {
        method: "POST",
        body: JSON.stringify(parsed.data),
      },
    );

    revalidateTag(tags.organizationUsers(organizationId));
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
