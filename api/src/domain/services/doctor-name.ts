import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";

export const TREATMENT_LABELS: Record<DoctorTreatment, string> = {
  DR: "Dr.",
  DRA: "Dra.",
};

// Nunca se deduce del nombre: un tratamiento equivocado lo ve el paciente.
export function formatDoctorName(doctor: {
  treatment: DoctorTreatment | null;
  name: string;
  lastName: string;
}): string {
  const fullName = `${doctor.name} ${doctor.lastName}`;
  return doctor.treatment
    ? `${TREATMENT_LABELS[doctor.treatment]} ${fullName}`
    : fullName;
}
