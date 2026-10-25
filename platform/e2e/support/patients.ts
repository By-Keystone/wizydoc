import { randomUUID } from "node:crypto";
import { getTestPrisma } from "./db";
import { uniqueName } from "./users";

export const PATIENT_PHONE = "+51987654321";

export interface SeededPatient {
  id: string;
  name: string;
  lastName: string;
  fullName: string;
  phone: string;
}

export async function enablePatientRecords(accountId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId },
    data: { plan: "CONSULTORIO", status: "ACTIVE" },
  });
}

export async function createPatient(
  accountId: string,
  patientId: string = randomUUID(),
): Promise<SeededPatient> {
  const prisma = await getTestPrisma();
  const name = uniqueName("Paciente");
  const lastName = "Pruebas";
  await prisma.patient.create({
    data: {
      id: patientId,
      name,
      lastName,
      email: `paciente-${randomUUID()}@example.com`,
      phone: PATIENT_PHONE,
      documentNumber: randomUUID().slice(0, 8),
      documentType: "DNI",
      accountId,
    },
  });

  return {
    id: patientId,
    name,
    lastName,
    fullName: `${name} ${lastName}`,
    phone: PATIENT_PHONE,
  };
}

// La lista de pacientes de una sede sólo incluye a quien tiene alguna cita en ella.
export async function seedPatientWithAppointment(params: {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
}): Promise<SeededPatient> {
  const patient = await createPatient(params.accountId);
  const prisma = await getTestPrisma();
  await prisma.appointment.create({
    data: {
      doctorProfileId: params.doctorProfileId,
      clinicId: params.clinicId,
      patientId: patient.id,
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });

  return patient;
}
