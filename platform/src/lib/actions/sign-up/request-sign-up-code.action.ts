"use server";

import type { DataActionState } from "@/lib/actions/types";
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
  signUpEmailSchema,
} from "@/lib/auth/sign-up-validation";
import { revalidatePath } from "next/cache";
import { fieldFailure, signUpFailure } from "./sign-up-failure";

type RequestCodeState = DataActionState<{
  wasCodeSent: boolean;
  secondsUntilResend: number;
}>;

export async function requestSignUpCodeAction(
  formData: FormData,
): Promise<RequestCodeState> {
  if (!isServerlessBackend()) {
    return { status: "error", message: REQUEST_CODE_ERROR };
  }

  const parsedEmail = signUpEmailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return fieldFailure("email", parsedEmail.error.issues[0].message);
  }
  const email = parsedEmail.data;

  const progress = await readSignUpProgress();
  // Con token el código ya se gastó: el backend sí envía uno nuevo.
  if (progress?.email === email && !progress.verificationToken) {
    const secondsLeft = secondsUntilResend(progress, Date.now());
    if (secondsLeft > 0) {
      revalidatePath("/register");
      return {
        status: "success",
        data: { wasCodeSent: false, secondsUntilResend: secondsLeft },
      };
    }
  }

  try {
    await signUpApi.requestCode(email);
  } catch (error) {
    return signUpFailure(error, REQUEST_CODE_ERROR, "email");
  }

  await saveSignUpProgress({ email, codeRequestedAt: Date.now() });
  revalidatePath("/register");
  return {
    status: "success",
    data: { wasCodeSent: true, secondsUntilResend: RESEND_COOLDOWN_SECONDS },
  };
}
