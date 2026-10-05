"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import { tags } from "@/lib/api/memberships";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const createOrganizationSchema = z.object({
  name: z.string(),
});

export type CreateOrganizationState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          keyof z.infer<typeof createOrganizationSchema>,
          { errors: string[] } | undefined
        >
      >;
    }
  | { status: "success" }
  | { status: "auth-expired" };

export const createOrganizationAction = async (
  _prevState: CreateOrganizationState,
  data: FormData,
): Promise<CreateOrganizationState> => {
  const session = await getSession();

  if (!session) return { status: "auth-expired" };

  const parsed = createOrganizationSchema.safeParse({
    name: data.get("name"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    await doFetchJson("/organization", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });

    revalidateTag(tags.memberships());
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
};
