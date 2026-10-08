"use server";

import { tags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { toActionState } from "@/lib/actions/to-action-state";
import { getSession } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import z, { treeifyError } from "zod";

const createClinicSchema = z.object({
  name: z.string(),
  phone: z.string(),
  address: z.string(),
});

export type CreateClinicState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          keyof z.infer<typeof createClinicSchema>,
          { errors: string[] } | undefined
        >
      >;
    }
  | { status: "success" }
  | { status: "auth-expired" };

export async function createClinicAction(
  organizationId: string,
  _prevState: CreateClinicState,
  data: FormData,
): Promise<CreateClinicState> {
  const session = await getSession();
  if (!session) return { status: "auth-expired" };

  const parsed = createClinicSchema.safeParse({
    name: data.get("name"),
    phone: data.get("phone"),
    address: data.get("address"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  try {
    await doFetchJson(`/organization/${organizationId}/clinics`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });

    revalidateTag(tags.organizationClinics(organizationId));
    return { status: "success" };
  } catch (error) {
    return toActionState(error);
  }
}
