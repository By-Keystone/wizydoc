"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { clinicApi, tags as clinicTags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { tags as membershipTags } from "@/lib/api/memberships";
import { tags } from "@/lib/api/organizations";
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

export async function inviteOrganizationUserAction(
  organizationId: string,
  _prevState: ActionState,
  data: FormData,
): Promise<ActionState> {
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
    const { message } = await doFetchJson<{ message: string }>(
      `/organization/${encodeURIComponent(organizationId)}/invitations`,
      { method: "POST", body: JSON.stringify(parsed.data) },
    );

    revalidateTag(tags.organizationUsers(organizationId));
    revalidateTag(membershipTags.memberships());
    revalidateTag(membershipTags.membershipsForResource(organizationId));
    // Promover o degradar a un ADMIN cambia sus memberships de sede: sus tablas cambian.
    try {
      const clinics = await clinicApi.getOrganizationClinics(organizationId);
      for (const clinic of clinics) {
        revalidateTag(clinicTags.clinicUsers(clinic.id));
      }
    } catch {
      // La asignación ya salió bien: sin la lista de sedes sólo quedan tablas por refrescar.
    }
    return { status: "success", message };
  } catch (error) {
    return toActionState(error);
  }
}
