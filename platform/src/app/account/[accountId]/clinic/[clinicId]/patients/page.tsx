import type { Metadata } from "next";
import { PatientsView } from "@/components/patient/patients-view";

export const metadata: Metadata = { title: "Pacientes" };

interface Props {
  params: Promise<{ accountId: string; clinicId: string }>;
}

export default async function ClinicPatientsPage({ params }: Props) {
  const { accountId, clinicId } = await params;

  return (
    <PatientsView
      resourceId={clinicId}
      patientsPath={`/account/${accountId}/clinic/${clinicId}/patients`}
      scopeDescription="Pacientes con alguna cita en esta sede."
    />
  );
}
