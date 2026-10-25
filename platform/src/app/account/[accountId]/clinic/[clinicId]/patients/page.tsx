import type { Metadata } from "next";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { PatientsTable } from "@/components/patient/patients-table";
import { isPlanFeatureError } from "@/lib/api/errors";
import { patientsApi } from "@/lib/api/patients";
import type { PatientListEntry } from "@/lib/api/patients/types";

export const metadata: Metadata = { title: "Pacientes" };

interface Props {
  params: Promise<{ accountId: string; clinicId: string }>;
}

async function loadPatients(
  clinicId: string,
): Promise<PatientListEntry[] | null> {
  try {
    return await patientsApi.getAccountPatients(clinicId);
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export default async function ClinicPatientsPage({ params }: Props) {
  const { accountId, clinicId } = await params;

  const patients = await loadPatients(clinicId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-teal-dark">
        Pacientes
      </h1>
      {patients ? (
        <PatientsTable
          patients={patients}
          buildHref={(patientId) =>
            `/account/${accountId}/clinic/${clinicId}/patients/${patientId}`
          }
        />
      ) : (
        <PlanFeatureNotice plan="CONSULTORIO" />
      )}
    </div>
  );
}
