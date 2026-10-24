"use server";

import { toActionState } from "@/lib/actions/to-action-state";
import type { ActionState } from "@/lib/actions/types";
import { clinicApi, tags } from "@/lib/api/clinic";
import { doFetchJson } from "@/lib/api/fetch";
import { tags as membershipTags } from "@/lib/api/memberships";
import { tags as organizationTags } from "@/lib/api/organizations";
import { tags as userTags } from "@/lib/api/user";
import { getSession } from "@/lib/auth/session";
import { formatList } from "@/lib/utils";
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
    clinicIds: z
      .array(z.uuid(), { error: "Elige al menos una sede" })
      .min(1, { error: "Elige al menos una sede" })
      .max(50),
  })
  .refine((data) => data.role !== "DOCTOR" || !!data.specialtyIds?.length, {
    message: "Selecciona al menos una especialidad",
    path: ["specialtyIds"],
  });

interface AssignResult {
  outcome: string;
  invitationSent: boolean;
  message: string;
}

export async function inviteUserAction(
  organizationId: string,
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
    clinicIds: [...new Set(data.getAll("clinicIds"))],
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  const { clinicIds, ...body } = parsed.data;

  try {
    // Con una sola sede la autoriza el api; un ADMIN directo de sede no lee la organización.
    let chosen = clinicIds.map((id) => ({ id, name: "" }));
    if (clinicIds.length > 1) {
      const organizationClinics =
        await clinicApi.getOrganizationClinics(organizationId);
      const byId = new Map(organizationClinics.map((c) => [c.id, c.name]));
      if (clinicIds.some((id) => !byId.has(id))) {
        return {
          status: "error",
          message: "Alguna de las sedes elegidas no es de esta organización.",
        };
      }
      chosen = clinicIds
        .map((id) => ({ id, name: byId.get(id) as string }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
    }

    const saved: { id: string; name: string; result: AssignResult }[] = [];
    let failure: { name: string; state: ActionState } | null = null;

    // En serie: la primera llamada crea al usuario y las siguientes lo encuentran.
    for (const clinic of chosen) {
      try {
        const result = await doFetchJson<AssignResult>(
          `/clinic/${encodeURIComponent(clinic.id)}/invitations`,
          { method: "POST", body: JSON.stringify(body) },
        );
        saved.push({ ...clinic, result });
      } catch (error) {
        failure = { name: clinic.name, state: toActionState(error) };
        break;
      }
    }

    if (saved.length > 0) {
      for (const clinic of saved) {
        revalidateTag(tags.clinicUsers(clinic.id));
        revalidateTag(membershipTags.membershipsForResource(clinic.id));
      }
      revalidateTag(organizationTags.organizationUsers(organizationId));
      revalidateTag(userTags.myProfile());
      revalidateTag(membershipTags.memberships());
    }

    if (failure) {
      const { state } = failure;
      if (state.status !== "error") return state;
      if (saved.length === 0) return state;
      const reason = state.message.replace(/.$/, "");
      return {
        status: "error",
        message: `Guardamos ${formatList(saved.map((s) => s.name))}. No se pudo en ${failure.name} (${reason}). Vuelve a intentarlo: lo ya guardado no se duplica.`,
      };
    }

    if (saved.length === 1) {
      return { status: "success", message: saved[0].result.message };
    }

    const names = formatList(saved.map((s) => s.name));
    const fullName = `${body.name} ${body.lastName}`;
    const isSelf =
      session.user.email.toLowerCase() === body.email.toLowerCase();
    const invitationSent = saved.some((s) => s.result.invitationSent);

    if (isSelf && body.role === "DOCTOR") {
      return {
        status: "success",
        message: `Listo. Ya atiendes en ${names}. Configura tus horarios en cada sede para aparecer en el link de reserva.`,
      };
    }
    return {
      status: "success",
      message: invitationSent
        ? `Invitación enviada. ${fullName} aparece en los usuarios de ${names}.`
        : `Listo. Guardamos el acceso de ${fullName} a ${names}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}
