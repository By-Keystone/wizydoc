"use server";

import type { DataActionState } from "@/lib/actions/types";
import { ApiError } from "@/lib/api/errors";
import { signUpApi } from "@/lib/api/sign-up";
import { isServerlessBackend } from "@/lib/backend";
import {
  RESEND_COOLDOWN_SECONDS,
  readSignUpProgress,
  saveSignUpProgress,
  secondsUntilResend,
} from "@/lib/auth/sign-up-progress";
import {
  REQUEST_CODE_ERROR,
  TOO_MANY_ATTEMPTS_ERROR,
  signUpEmailSchema,
} from "@/lib/auth/sign-up-validation";
import { revalidatePath } from "next/cache";

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;

type RequestCodeState = DataActionState<{ secondsUntilResend: number }>;

function emailFieldError(message: string): RequestCodeState {
  return {
    status: "error",
    message,
    fieldErrors: { email: { errors: [message] } },
  };
}

function requestCodeFailure(error: unknown): RequestCodeState {
  if (!(error instanceof ApiError)) {
    console.error("[sign-up-code]", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "error", message: REQUEST_CODE_ERROR };
  }

  const httpStatus = error.status;
  if (httpStatus === BAD_REQUEST && error.message) {
    return emailFieldError(error.message);
  }
  if (httpStatus === TOO_MANY_REQUESTS) {
    return { status: "error", message: TOO_MANY_ATTEMPTS_ERROR };
  }
  if (httpStatus !== BAD_REQUEST) {
    console.error("[sign-up-code]", { httpStatus });
  }
  return { status: "error", message: REQUEST_CODE_ERROR };
}

export async function requestSignUpCodeAction(
  formData: FormData,
): Promise<RequestCodeState> {
  if (!isServerlessBackend()) {
    return { status: "error", message: REQUEST_CODE_ERROR };
  }

  const parsedEmail = signUpEmailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return emailFieldError(parsedEmail.error.issues[0].message);
  }
  const email = parsedEmail.data;

  const progress = await readSignUpProgress();
  if (progress?.email === email) {
    const secondsLeft = secondsUntilResend(progress, Date.now());
    if (secondsLeft > 0) {
      return { status: "success", data: { secondsUntilResend: secondsLeft } };
    }
  }

  try {
    await signUpApi.requestCode(email);
  } catch (error) {
    return requestCodeFailure(error);
  }

  await saveSignUpProgress({ email, codeRequestedAt: Date.now() });
  revalidatePath("/register");
  return {
    status: "success",
    data: { secondsUntilResend: RESEND_COOLDOWN_SECONDS },
  };
}
