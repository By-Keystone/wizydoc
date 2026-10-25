import type { Metadata } from "next";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { PatientsTable } from "@/components/patient/patients-table";
import { isPlanFeatureError } from "@/lib/api/errors";
import { patientsApi } from "@/lib/api/patients";
import type { PatientListEntry } from "@/lib/api/patients/types";

export const metadata: Metadata = { title: "Pacientes" };

async function loadPatients(): Promise<PatientListEntry[] | null> {
  try {
    return await patientsApi.getAccountPatients();
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export default async function PatientsPage() {
  const patients = await loadPatients();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-teal-dark">
        Pacientes
      </h1>
      {patients ? (
        <PatientsTable patients={patients} />
      ) : (
        <PlanFeatureNotice plan="CONSULTORIO" />
      )}
    </div>
  );
}
