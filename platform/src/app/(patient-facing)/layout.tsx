import type { Metadata } from "next";
import { PatientFacingShell } from "@/components/common/patient-facing-shell";

export const metadata: Metadata = {
  title: "WizyDoc — Tu cita",
  robots: { index: false, follow: false },
  // El enlace da acceso a la cita: no debe salir en el Referer hacia otros sitios.
  referrer: "no-referrer",
};

export default function PatientFacingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PatientFacingShell>{children}</PatientFacingShell>;
}
