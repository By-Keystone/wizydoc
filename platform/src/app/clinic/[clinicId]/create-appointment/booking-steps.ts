import type { ClinicDoctor } from "@/lib/api/doctors/types";

export type Specialty = ClinicDoctor["specialties"][number];

export type BookingStep = "specialty" | "doctor" | "datetime" | "patient";

export function listSpecialties(doctors: ClinicDoctor[]): Specialty[] {
  const specialtiesById = new Map<string, Specialty>();
  for (const doctor of doctors) {
    for (const specialty of doctor.specialties) {
      specialtiesById.set(specialty.id, specialty);
    }
  }
  return Array.from(specialtiesById.values());
}

export function listDoctorsOf(
  doctors: ClinicDoctor[],
  specialtyId: string,
): ClinicDoctor[] {
  return doctors.filter((doctor) =>
    doctor.specialties.some((specialty) => specialty.id === specialtyId),
  );
}

export function findSoleDoctor(doctors: ClinicDoctor[]): ClinicDoctor | null {
  return doctors.length === 1 ? doctors[0] : null;
}

export function pickInitialSelection(doctors: ClinicDoctor[]): {
  specialty: Specialty | null;
  doctor: ClinicDoctor | null;
} {
  const specialties = listSpecialties(doctors);
  const specialty = specialties.length === 1 ? specialties[0] : null;
  const doctor = specialty
    ? findSoleDoctor(listDoctorsOf(doctors, specialty.id))
    : null;
  return { specialty, doctor };
}

export function listSteps(
  doctors: ClinicDoctor[],
  specialty: Specialty | null,
): BookingStep[] {
  const specialties = listSpecialties(doctors);
  const asksSpecialty = specialties.length > 1;
  const asksDoctor = specialty
    ? listDoctorsOf(doctors, specialty.id).length > 1
    : specialties.some(({ id }) => listDoctorsOf(doctors, id).length > 1);

  const steps: BookingStep[] = [];
  if (asksSpecialty) steps.push("specialty");
  if (asksDoctor) steps.push("doctor");
  steps.push("datetime", "patient");
  return steps;
}
