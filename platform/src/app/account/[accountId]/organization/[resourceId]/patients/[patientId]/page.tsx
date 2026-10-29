import type { Metadata } from "next";
import { PatientDetailView } from "@/components/patient/patient-detail-view";

export const metadata: Metadata = { title: "Ficha del paciente" };

interface Props {
  params: Promise<{ accountId: string; resourceId: string; patientId: string }>;
}

export default async function OrganizationPatientDetailPage({ params }: Props) {
  const { accountId, resourceId, patientId } = await params;

  return (
    <PatientDetailView
      resourceId={resourceId}
      patientId={patientId}
      patientsPath={`/account/${accountId}/organization/${resourceId}/patients`}
    />
  );
}
