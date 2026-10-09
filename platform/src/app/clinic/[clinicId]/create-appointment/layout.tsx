import { PatientFacingShell } from "@/components/common/patient-facing-shell";

export default function CreateAppointmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PatientFacingShell>{children}</PatientFacingShell>;
}
