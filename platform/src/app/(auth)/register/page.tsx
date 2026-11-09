import { isServerlessBackend } from "@/lib/backend";
import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { SignUpEmailStep } from "./sign-up-email-step";

export const metadata: Metadata = {
  title: "Crea tu cuenta",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return isServerlessBackend() ? <SignUpEmailStep /> : <RegisterForm />;
}
