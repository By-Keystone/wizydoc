import type { Metadata } from "next";
import { PatientDetailView } from "@/components/patient/patient-detail-view";

export const metadata: Metadata = { title: "Ficha del paciente" };

interface Props {
  params: Promise<{ accountId: string; clinicId: string; patientId: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const { accountId, clinicId, patientId } = await params;

  return (
    <PatientDetailView
      resourceId={clinicId}
      patientId={patientId}
      patientsPath={`/account/${accountId}/clinic/${clinicId}/patients`}
    />
  );
}
