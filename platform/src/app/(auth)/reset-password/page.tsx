import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

// El token del enlace es la credencial: ni se indexa ni viaja en el Referer.
export const metadata: Metadata = {
  title: "Crea tu contraseña nueva",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
