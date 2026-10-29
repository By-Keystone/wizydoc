import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PlanFeatureNotice } from "@/components/common/plan-feature-notice";
import { isPlanFeatureError } from "@/lib/api/errors";
import { patientsApi } from "@/lib/api/patients";
import type { PatientDetail } from "@/lib/api/patients/types";
import { AppointmentHistory } from "./appointment-history";
import { PatientHeader } from "./patient-header";
import { PatientTabs } from "./patient-tabs";
import { RecordForm } from "./record-form";

interface Props {
  resourceId: string;
  patientId: string;
  patientsPath: string;
}

async function loadPatientDetail(
  resourceId: string,
  patientId: string,
): Promise<PatientDetail | null> {
  try {
    return await patientsApi.getPatientDetail(resourceId, patientId);
  } catch (error) {
    if (isPlanFeatureError(error)) return null;
    throw error;
  }
}

export async function PatientDetailView({
  resourceId,
  patientId,
  patientsPath,
}: Props) {
  const detail = await loadPatientDetail(resourceId, patientId);

  const backLink = (
    <Link
      href={patientsPath}
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
        record={<RecordForm resourceId={resourceId} patient={patient} />}
      />
    </div>
  );
}
