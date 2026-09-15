"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { AuthExpiredError } from "@/lib/api/errors";
import { PLAN_VALUES } from "@/lib/plans";
import { redirect } from "next/navigation";
import z, { treeifyError } from "zod";

const completeAccountSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  plan: z.enum(PLAN_VALUES, { error: "Elige un plan" }),
});

export type CreateAccountState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<
          keyof z.infer<typeof completeAccountSchema>,
          { errors: string[] } | undefined
        >
      >;
    };

export async function createAccountAction(
  _prevState: CreateAccountState,
  data: FormData,
): Promise<CreateAccountState> {
  const parsed = completeAccountSchema.safeParse({
    name: data.get("name"),
    plan: data.get("plan"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  let accountId: string;
  try {
    const result = await doFetchJson<{ accountId: string }>("/account", {
      method: "POST",
      body: JSON.stringify({
        accountName: parsed.data.name,
        plan: parsed.data.plan,
      }),
    });
    accountId = result.accountId;
  } catch (error) {
    if (error instanceof AuthExpiredError) redirect("/login");
    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo crear la cuenta",
    };
  }

  redirect(`/account/${accountId}/select`);
}
