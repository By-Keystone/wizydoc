"use server";

import type { ActionState } from "@/lib/actions/types";
import { ApiError } from "@/lib/api/errors";
import { signUpApi } from "@/lib/api/sign-up";
import type { CognitoTokens } from "@/lib/api/sign-up/types";
import { isServerlessBackend } from "@/lib/backend";
import { saveCognitoSession } from "@/lib/auth/cognito-session";
import {
  clearSignUpProgress,
  readSignUpProgress,
} from "@/lib/auth/sign-up-progress";
import {
  CONFIRM_SIGN_UP_ERROR,
  VERIFICATION_EXPIRED_CODE,
  VERIFICATION_EXPIRED_MESSAGE,
  signUpPasswordSchema,
} from "@/lib/auth/sign-up-validation";
import { redirect } from "next/navigation";
import { BAD_REQUEST, fieldFailure, signUpFailure } from "./sign-up-failure";

const verificationExpired: ActionState = {
  status: "error",
  message: VERIFICATION_EXPIRED_MESSAGE,
  code: VERIFICATION_EXPIRED_CODE,
};

const isVerificationExpired = (error: unknown) =>
  error instanceof ApiError &&
  error.status === BAD_REQUEST &&
  error.message === VERIFICATION_EXPIRED_MESSAGE;

export async function confirmSignUpAction(
  formData: FormData,
): Promise<ActionState> {
  if (!isServerlessBackend()) {
    return { status: "error", message: CONFIRM_SIGN_UP_ERROR };
  }

  const progress = await readSignUpProgress();
  if (!progress?.verificationToken) return verificationExpired;

  const parsedPassword = signUpPasswordSchema.safeParse(
    formData.get("password"),
  );
  if (!parsedPassword.success) {
    return fieldFailure("password", parsedPassword.error.issues[0].message);
  }

  let tokens: CognitoTokens | null;
  try {
    tokens = await signUpApi.confirm({
      email: progress.email,
      password: parsedPassword.data,
      verificationToken: progress.verificationToken,
    });
  } catch (error) {
    if (isVerificationExpired(error)) return verificationExpired;
    return signUpFailure(error, CONFIRM_SIGN_UP_ERROR);
  }

  await clearSignUpProgress();
  if (!tokens) redirect("/login?registered=ok");
  await saveCognitoSession(tokens);
  redirect("/onboarding");
}
