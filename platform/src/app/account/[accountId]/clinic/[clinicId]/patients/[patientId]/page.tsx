import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppointmentHistory } from "@/components/patient/appointment-history";
import { PatientHeader } from "@/components/patient/patient-header";
import { PatientTabs } from "@/components/patient/patient-tabs";
import { RecordForm } from "@/components/patient/record-form";
import { patientsApi } from "@/lib/api/patients";

interface Props {
  params: Promise<{ accountId: string; clinicId: string; patientId: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const { accountId, clinicId, patientId } = await params;

  const { patient, history, metrics } =
    await patientsApi.getPatientDetail(patientId);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/account/${accountId}/clinic/${clinicId}/patients`}
        className="inline-flex w-fit items-center gap-1 text-sm text-brand-gray hover:text-brand-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Pacientes
      </Link>

      <PatientHeader patient={patient} />

      <PatientTabs
        history={<AppointmentHistory history={history} metrics={metrics} />}
        record={<RecordForm patient={patient} />}
      />
    </div>
  );
}
