import type { ActionFailure } from "@/lib/actions/types";
import { ApiError } from "@/lib/api/errors";
import { TOO_MANY_ATTEMPTS_ERROR } from "@/lib/auth/sign-up-validation";

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;

export function fieldFailure(field: string, message: string): ActionFailure {
  return {
    status: "error",
    message,
    fieldErrors: { [field]: { errors: [message] } },
  };
}

export function signUpFailure(
  error: unknown,
  fallbackMessage: string,
  field?: string,
): ActionFailure {
  if (!(error instanceof ApiError)) {
    console.error("[sign-up-code]", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "error", message: fallbackMessage };
  }

  if (error.status === BAD_REQUEST && error.message) {
    return field
      ? fieldFailure(field, error.message)
      : { status: "error", message: error.message };
  }
  if (error.status === TOO_MANY_REQUESTS) {
    return { status: "error", message: TOO_MANY_ATTEMPTS_ERROR };
  }
  if (error.status !== BAD_REQUEST) {
    console.error("[sign-up-code]", { httpStatus: error.status });
  }
  return { status: "error", message: fallbackMessage };
}
