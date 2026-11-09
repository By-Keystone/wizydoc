"use server";

import type { ActionState } from "@/lib/actions/types";
import { signUpApi } from "@/lib/api/sign-up";
import { isServerlessBackend } from "@/lib/backend";
import {
  readSignUpProgress,
  saveSignUpProgress,
} from "@/lib/auth/sign-up-progress";
import {
  VERIFY_CODE_ERROR,
  signUpCodeSchema,
} from "@/lib/auth/sign-up-validation";
import { revalidatePath } from "next/cache";
import { fieldFailure, signUpFailure } from "./sign-up-failure";

export async function verifySignUpCodeAction(
  formData: FormData,
): Promise<ActionState> {
  if (!isServerlessBackend()) {
    return { status: "error", message: VERIFY_CODE_ERROR };
  }

  const progress = await readSignUpProgress();
  if (!progress) {
    revalidatePath("/register");
    return { status: "error", message: VERIFY_CODE_ERROR };
  }

  const parsedCode = signUpCodeSchema.safeParse(formData.get("code"));
  if (!parsedCode.success) {
    return fieldFailure("code", parsedCode.error.issues[0].message);
  }

  let verificationToken: string;
  try {
    verificationToken = await signUpApi.verifyCode(
      progress.email,
      parsedCode.data,
    );
  } catch (error) {
    return signUpFailure(error, VERIFY_CODE_ERROR, "code");
  }

  await saveSignUpProgress({ ...progress, verificationToken });
  revalidatePath("/register");
  return { status: "success" };
}
