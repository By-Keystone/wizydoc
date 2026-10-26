import type { Metadata } from "next";
import { PatientsView } from "@/components/patient/patients-view";

export const metadata: Metadata = { title: "Pacientes" };

interface Props {
  params: Promise<{ accountId: string; resourceId: string }>;
}

export default async function PatientsPage({ params }: Props) {
  const { accountId, resourceId } = await params;

  return (
    <PatientsView
      resourceId={resourceId}
      patientsPath={`/account/${accountId}/organization/${resourceId}/patients`}
      scopeDescription="Pacientes de todas las sedes."
    />
  );
}
