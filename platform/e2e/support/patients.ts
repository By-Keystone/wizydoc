import { randomBytes, randomUUID } from "node:crypto";
import { getTestPrisma } from "./db";
import { uniqueName } from "./users";

export const PATIENT_PHONE = "+51987654321";
// Sin los dígitos que usan las búsquedas de las pruebas.
export const NEUTRAL_PATIENT_PHONE = "+51900000000";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SLOT_MILLISECONDS = 45 * 60 * 1000;
const SEEDED_ID_SPACING_MILLISECONDS = 1000;
const UUID_V7_VERSION_BITS = 0x70;
const UUID_VARIANT_BITS = 0x80;

export type SeededAppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export interface SeededPatient {
  id: string;
  name: string;
  lastName: string;
  fullName: string;
  phone: string;
  documentNumber: string;
}

export interface PatientSpec {
  name: string;
  lastName: string;
  documentNumber: string;
  documentType?: string;
  phone?: string;
  email?: string;
}

export async function enablePatientRecords(accountId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId },
    data: { plan: "CONSULTORIO", status: "ACTIVE" },
  });
}

export async function setAccountPlan(
  accountId: string,
  plan: "FREE" | "CONSULTORIO" | "CLINICA",
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId },
    data: { plan, status: "ACTIVE" },
  });
}

export async function createPatient(
  accountId: string,
  patientId: string = randomUUID(),
): Promise<SeededPatient> {
  const prisma = await getTestPrisma();
  const name = uniqueName("Paciente");
  const lastName = "Pruebas";
  const documentNumber = randomUUID().slice(0, 8);
  await prisma.patient.create({
    data: {
      id: patientId,
      name,
      lastName,
      email: `paciente-${randomUUID()}@example.com`,
      phone: PATIENT_PHONE,
      documentNumber,
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
    documentNumber,
  };
}

// La lista y la ficha de una sede sólo incluyen a quien tiene alguna cita en ella.
export async function seedPatientWithAppointment(params: {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
  patientId?: string;
}): Promise<SeededPatient> {
  const patient = await createPatient(params.accountId, params.patientId);
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

// El orden de la lista es el del id: un uuid7 con el instante que se pide lo fija sin esperar al reloj.
export function uuidV7At(instantMilliseconds: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(instantMilliseconds, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | UUID_V7_VERSION_BITS;
  bytes[8] = (bytes[8] & 0x3f) | UUID_VARIANT_BITS;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export interface SeedAppointmentParams {
  patientId: string;
  clinicId: string;
  doctorProfileId: string;
  scheduledAt: Date;
  status?: SeededAppointmentStatus;
}

export async function seedAppointment(
  params: SeedAppointmentParams,
): Promise<string> {
  const prisma = await getTestPrisma();
  const appointment = await prisma.appointment.create({
    data: {
      doctorProfileId: params.doctorProfileId,
      clinicId: params.clinicId,
      patientId: params.patientId,
      scheduledAt: params.scheduledAt,
      status: params.status ?? "COMPLETED",
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });

  return appointment.id;
}

export interface SeedPatientInClinicParams {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
  spec: PatientSpec;
  idInstantMilliseconds: number;
  appointment: Pick<SeedAppointmentParams, "scheduledAt" | "status">;
}

export async function seedPatientInClinic(
  params: SeedPatientInClinicParams,
): Promise<SeededPatient> {
  const { spec } = params;
  const prisma = await getTestPrisma();
  const id = uuidV7At(params.idInstantMilliseconds);
  const phone = spec.phone ?? NEUTRAL_PATIENT_PHONE;

  await prisma.patient.create({
    data: {
      id,
      name: spec.name,
      lastName: spec.lastName,
      email: spec.email ?? `paciente-${randomUUID()}@example.com`,
      phone,
      documentNumber: spec.documentNumber,
      documentType: spec.documentType ?? "DNI",
      accountId: params.accountId,
    },
  });
  await seedAppointment({
    patientId: id,
    clinicId: params.clinicId,
    doctorProfileId: params.doctorProfileId,
    scheduledAt: params.appointment.scheduledAt,
    status: params.appointment.status,
  });

  return {
    id,
    name: spec.name,
    lastName: spec.lastName,
    fullName: `${spec.name} ${spec.lastName}`,
    phone,
    documentNumber: spec.documentNumber,
  };
}

export interface SeedPatientsInOrderParams {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
  specs: PatientSpec[];
}

// Los ids nacen un día antes de la prueba, así que un paciente que reserva durante ella queda primero.
export async function seedPatientsInOrder(
  params: SeedPatientsInOrderParams,
): Promise<SeededPatient[]> {
  const firstInstant =
    Date.now() -
    MILLISECONDS_PER_DAY -
    params.specs.length * SEEDED_ID_SPACING_MILLISECONDS;
  const firstAppointment = Date.now() - 30 * MILLISECONDS_PER_DAY;
  const seeded: SeededPatient[] = [];

  for (const [index, spec] of params.specs.entries()) {
    seeded.push(
      await seedPatientInClinic({
        accountId: params.accountId,
        clinicId: params.clinicId,
        doctorProfileId: params.doctorProfileId,
        spec,
        idInstantMilliseconds:
          firstInstant + index * SEEDED_ID_SPACING_MILLISECONDS,
        appointment: {
          scheduledAt: new Date(firstAppointment + index * SLOT_MILLISECONDS),
        },
      }),
    );
  }

  return seeded;
}

export function numberedPatientSpecs(
  count: number,
  lastName: string,
  firstDocumentNumber: number,
): PatientSpec[] {
  return Array.from({ length: count }, (_, index) => {
    const position = String(index + 1).padStart(2, "0");
    return {
      name: `Paciente${position}`,
      lastName,
      documentNumber: String(firstDocumentNumber + index),
    };
  });
}
