import { PatientsTable } from "@/components/patient/patients-table";
import { patientsApi } from "@/lib/api/patients";

interface Props {
  params: Promise<{ accountId: string; clinicId: string }>;
}

export default async function ClinicPatientsPage({ params }: Props) {
  const { accountId, clinicId } = await params;

  const patients = await patientsApi.getAccountPatients(clinicId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-teal-dark">Pacientes</h1>
      <PatientsTable
        patients={patients}
        buildHref={(patientId) =>
          `/account/${accountId}/clinic/${clinicId}/patients/${patientId}`
        }
      />
    </div>
  );
}
