import { PatientsTable } from "@/components/patient/patients-table";
import { patientsApi } from "@/lib/api/patients";

export default async function PatientsPage() {
  const patients = await patientsApi.getAccountPatients();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-teal-dark">Pacientes</h1>
      <PatientsTable patients={patients} />
    </div>
  );
}
