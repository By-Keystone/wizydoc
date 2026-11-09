import { isServerlessBackend } from "@/lib/backend";
import {
  readSignUpProgress,
  secondsUntilResend,
} from "@/lib/auth/sign-up-progress";
import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { SignUpCodeStep } from "./sign-up-code-step";
import { SignUpEmailStep } from "./sign-up-email-step";
import { SignUpPasswordStep } from "./sign-up-password-step";

export const metadata: Metadata = {
  title: "Crea tu cuenta",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (!isServerlessBackend()) return <RegisterForm />;

  const progress = await readSignUpProgress();
  if (!progress) return <SignUpEmailStep />;

  if (progress.verificationToken) {
    return <SignUpPasswordStep email={progress.email} />;
  }

  return (
    <SignUpCodeStep
      email={progress.email}
      secondsUntilResend={secondsUntilResend(progress, Date.now())}
    />
  );
}
