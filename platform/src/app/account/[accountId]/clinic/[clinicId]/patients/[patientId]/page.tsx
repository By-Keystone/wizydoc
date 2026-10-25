import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppointmentHistory } from "@/components/patient/appointment-history";
import { PatientHeader } from "@/components/patient/patient-header";
import { PatientTabs } from "@/components/patient/patient-tabs";
import { RecordForm } from "@/components/patient/record-form";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { isPlanFeatureError } from "@/lib/api/errors";
import { patientsApi } from "@/lib/api/patients";
import type { PatientDetail } from "@/lib/api/patients/types";

export const metadata: Metadata = { title: "Ficha del paciente" };

interface Props {
  params: Promise<{ accountId: string; clinicId: string; patientId: string }>;
}

async function loadPatientDetail(
  patientId: string,
): Promise<PatientDetail | null> {
  try {
    return await patientsApi.getPatientDetail(patientId);
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export default async function PatientDetailPage({ params }: Props) {
  const { accountId, clinicId, patientId } = await params;

  const detail = await loadPatientDetail(patientId);

  const backLink = (
    <Link
      href={`/account/${accountId}/clinic/${clinicId}/patients`}
      className="inline-flex w-fit items-center gap-1 text-sm text-brand-gray hover:text-brand-ink"
    >
      <ChevronLeft className="h-4 w-4" />
      Pacientes
    </Link>
  );

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <PlanFeatureNotice plan="CONSULTORIO" />
      </div>
    );
  }

  const { patient, history, metrics } = detail;

  return (
    <div className="flex flex-col gap-4">
      {backLink}

      <PatientHeader patient={patient} />

      <PatientTabs
        history={<AppointmentHistory history={history} metrics={metrics} />}
        record={<RecordForm patient={patient} />}
      />
    </div>
  );
}
