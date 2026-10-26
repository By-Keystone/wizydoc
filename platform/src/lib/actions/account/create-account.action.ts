"use server";

import { doFetchJson } from "@/lib/api/fetch";
import { ApiError, AuthExpiredError } from "@/lib/api/errors";
import { tags as membershipTags } from "@/lib/api/memberships";
import { usersApi } from "@/lib/api/user";
import { PLAN_VALUES } from "@/lib/plans";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import z, { treeifyError } from "zod";

const CONFLICT_STATUS = 409;

const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 200;
const MAX_SPECIALTY_LENGTH = 100;

const GENERIC_ERROR = "No pudimos crear tu consultorio. Vuelve a intentarlo.";
const ACCOUNT_ONLY_CREATED_ERROR =
  "Tu cuenta quedó creada, pero no pudimos crear tu consultorio. Vuelve a intentarlo.";

function requiredText(
  maxLength: number,
  messages: { required: string; tooLong: string },
) {
  return z
    .string({ error: messages.required })
    .trim()
    .min(1, { error: messages.required })
    .max(maxLength, { error: messages.tooLong });
}

const completeAccountSchema = z.object({
  name: requiredText(MAX_NAME_LENGTH, {
    required: "Escribe el nombre de tu consultorio.",
    tooLong: `El nombre del consultorio no puede tener más de ${MAX_NAME_LENGTH} caracteres.`,
  }),
  address: requiredText(MAX_ADDRESS_LENGTH, {
    required: "Escribe la dirección de tu consultorio.",
    tooLong: `La dirección no puede tener más de ${MAX_ADDRESS_LENGTH} caracteres.`,
  }),
  specialty: requiredText(MAX_SPECIALTY_LENGTH, {
    required: "Escribe tu especialidad.",
    tooLong: `La especialidad no puede tener más de ${MAX_SPECIALTY_LENGTH} caracteres.`,
  }),
  plan: z.enum(PLAN_VALUES, { error: "Elige un plan" }),
  cardToken: z.string().min(1).optional(),
  billingAddress: z.string().min(1, "La dirección es requerida").optional(),
  billingCity: z.string().min(1, "La ciudad es requerida").optional(),
});

type CompleteAccountInput = z.infer<typeof completeAccountSchema>;

export type CreateAccountState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<
        Record<keyof CompleteAccountInput, { errors: string[] } | undefined>
      >;
    };

const isConflict = (error: unknown) =>
  error instanceof ApiError && error.status === CONFLICT_STATUS;

async function findAccountId() {
  return (await usersApi.getMe()).accountId;
}

async function createAccount(input: CompleteAccountInput) {
  const { accountId } = await doFetchJson<{ accountId: string }>("/account", {
    method: "POST",
    body: JSON.stringify({
      accountName: input.name,
      plan: input.plan,
      cardToken: input.cardToken,
      billingAddress: input.billingAddress,
      billingCity: input.billingCity,
    }),
  });
  return accountId;
}

// Cuenta de la beta o a medias: ya existe y solo falta el consultorio.
async function findOrCreateAccount(
  input: CompleteAccountInput,
): Promise<{ accountId: string; isNew: boolean }> {
  const existingAccountId = await findAccountId();
  if (existingAccountId) return { accountId: existingAccountId, isNew: false };

  try {
    return { accountId: await createAccount(input), isNew: true };
  } catch (error) {
    const accountIdFromOtherTab = isConflict(error)
      ? await findAccountId()
      : null;
    if (!accountIdFromOtherTab) throw error;
    return { accountId: accountIdFromOtherTab, isNew: false };
  }
}

function createFirstClinic(input: CompleteAccountInput) {
  return doFetchJson("/account/first-clinic", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      address: input.address,
      specialty: input.specialty,
    }),
  });
}

function logFirstClinicFailure(accountId: string, error: unknown) {
  console.error("[create-account] first clinic not created", {
    accountId,
    errName: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof ApiError ? error.status : undefined,
  });
}

export async function createAccountAction(
  _prevState: CreateAccountState,
  data: FormData,
): Promise<CreateAccountState> {
  const parsed = completeAccountSchema.safeParse({
    name: data.get("name"),
    address: data.get("address"),
    specialty: data.get("specialty"),
    plan: data.get("plan"),
    cardToken: data.get("cardToken") || undefined,
    billingAddress: data.get("billingAddress") || undefined,
    billingCity: data.get("billingCity") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Datos inválidos",
      fieldErrors: treeifyError(parsed.error).properties,
    };
  }

  let account: { accountId: string; isNew: boolean };
  try {
    account = await findOrCreateAccount(parsed.data);
  } catch (error) {
    if (error instanceof AuthExpiredError) redirect("/login");
    return { status: "error", message: GENERIC_ERROR };
  }

  try {
    await createFirstClinic(parsed.data);
  } catch (error) {
    if (error instanceof AuthExpiredError) redirect("/login");
    if (!isConflict(error)) {
      logFirstClinicFailure(account.accountId, error);
      return {
        status: "error",
        message: account.isNew ? ACCOUNT_ONLY_CREATED_ERROR : GENERIC_ERROR,
      };
    }
  }

  revalidateTag(membershipTags.memberships());
  redirect(`/account/${account.accountId}/select`);
}
