import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "./accounts";
import { getTestPrisma, type TestPrismaAppointmentRow } from "./db";
import { API_BASE_URL } from "./env";
import { uniqueName } from "./users";

const LIMA_UTC_OFFSET_HOURS = 5;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
const SLOT_MINUTES = 30;
const CLINIC_ADDRESS = "Jr. de la Unión 456, Lima";

export const DEFAULT_APPOINTMENT_TIME = "10:00";
export const DEFAULT_DAYS_AHEAD = 10;

export function limaWallTime(instant: Date): string {
  return new Date(
    instant.getTime() - LIMA_UTC_OFFSET_HOURS * MILLISECONDS_PER_HOUR,
  )
    .toISOString()
    .slice(0, 16);
}

export function wallTimeToInstant(wallTime: string): Date {
  return new Date(`${wallTime}:00-0${LIMA_UTC_OFFSET_HOURS}:00`);
}

export function limaWallTimeInDays(days: number, time: string): string {
  const date = limaWallTime(new Date(Date.now() + days * MILLISECONDS_PER_DAY));
  return `${date.slice(0, 10)}T${time}`;
}

export function limaWallTimeInHours(hours: number): string {
  const slotMilliseconds = SLOT_MINUTES * 60 * 1000;
  const target = Date.now() + hours * MILLISECONDS_PER_HOUR;
  const roundedUp = Math.ceil(target / slotMilliseconds) * slotMilliseconds;
  return limaWallTime(new Date(roundedUp));
}

export interface PortalDoctor {
  userId: string;
  membershipId: string;
  doctorProfileId: string;
  name: string;
  lastName: string;
}

export interface PortalScenario {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  specialtyId: string;
  specialtyName: string;
  doctor: PortalDoctor;
}

export type DoctorAvailability = "full-day" | "mornings" | "none";

export interface AddDoctorOptions {
  label: string;
  clinicId: string;
  admin: OnboardedAdmin;
  specialtyId: string;
  availability?: DoctorAvailability;
  weekdays?: number[];
  name?: string;
  lastName?: string;
}

export async function addPortalDoctor(
  options: AddDoctorOptions,
): Promise<PortalDoctor> {
  const member = await createMemberWithRole({
    accountId: options.admin.accountId,
    resourceId: options.clinicId,
    role: "DOCTOR",
    createdBy: options.admin.userId,
    emailPrefix: `doctor-${options.label}`,
    name: options.name,
    lastName: options.lastName,
  });
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.create({
    data: {
      membershipId: member.membershipId,
      specialties: { connect: [{ id: options.specialtyId }] },
    },
  });

  const availability = options.availability ?? "full-day";
  if (availability !== "none") {
    const [startTime, endTime] =
      availability === "full-day" ? ["00:00", "23:30"] : ["09:00", "12:00"];
    const weekdays = options.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    await prisma.availability.createMany({
      data: weekdays.map((dayOfWeek) => ({
        doctorProfileId: profile.id,
        dayOfWeek,
        startTime,
        endTime,
      })),
    });
  }

  return {
    userId: member.userId,
    membershipId: member.membershipId,
    doctorProfileId: profile.id,
    name: member.name,
    lastName: member.lastName,
  };
}

export async function removeAvailability(
  doctorProfileId: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.availability.deleteMany({ where: { doctorProfileId } });
}

export async function createPortalScenario(
  label: string,
): Promise<PortalScenario> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicName = uniqueName(`Sede-${label}`);
  const clinicPhone = "+51987654321";
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
    address: CLINIC_ADDRESS,
    phone: clinicPhone,
  });
  const specialtyName = uniqueName(`Especialidad-${label}`);
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );
  const doctor = await addPortalDoctor({
    label,
    clinicId,
    admin,
    specialtyId,
  });

  return {
    admin,
    organizationId,
    clinicId,
    clinicName,
    clinicAddress: CLINIC_ADDRESS,
    clinicPhone,
    specialtyId,
    specialtyName,
    doctor,
  };
}

export interface PortalPatient {
  name: string;
  lastName: string;
  phone: string;
  email: string;
  documentNumber: string;
  birthDate: string;
}

export function newPortalPatient(): PortalPatient {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  return {
    name: "Paula",
    lastName: `Quispe${suffix}`,
    phone: `+5190${Math.floor(1000000 + Math.random() * 8999999)}`,
    email: `paula.${suffix}@e2e.wizydoc.test`,
    documentNumber: suffix.toUpperCase(),
    birthDate: "1990-05-20",
  };
}

export function bookingRequestBody(
  scenario: PortalScenario,
  doctorProfileId: string,
  scheduledAt: string,
  patient: PortalPatient,
) {
  return {
    patientName: patient.name,
    patientLastName: patient.lastName,
    patientPhone: patient.phone,
    patientEmail: patient.email,
    patientDocumentNumber: patient.documentNumber,
    patientDocumentType: "DNI",
    patientBirthDate: patient.birthDate,
    durationMinutes: SLOT_MINUTES,
    scheduledAt,
    doctorProfileId,
    clinicId: scenario.clinicId,
    specialty: scenario.specialtyName,
  };
}

export async function postBooking(
  scenario: PortalScenario,
  doctorProfileId: string,
  scheduledAt: string,
  patient: PortalPatient = newPortalPatient(),
): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}/appointment`, {
    data: bookingRequestBody(scenario, doctorProfileId, scheduledAt, patient),
  });
}

export interface ManagedAppointment {
  appointmentId: string;
  patientId: string;
  patient: PortalPatient;
  doctorProfileId: string;
  token: string;
  scheduledAt: string;
}

export interface CreateManagedAppointmentOptions {
  doctorProfileId?: string;
  scheduledAt?: string;
}

export function generateAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}

// El enlace aún no se emite al reservar: se siembra el hash directamente.
export async function seedAccessToken(appointmentId: string): Promise<string> {
  const { token, tokenHash } = generateAccessToken();
  const prisma = await getTestPrisma();
  await prisma.appointmentAccessToken.create({
    data: { appointmentId, tokenHash },
  });
  return token;
}

export async function createManagedAppointment(
  scenario: PortalScenario,
  options: CreateManagedAppointmentOptions = {},
): Promise<ManagedAppointment> {
  const doctorProfileId =
    options.doctorProfileId ?? scenario.doctor.doctorProfileId;
  const scheduledAt =
    options.scheduledAt ??
    limaWallTimeInDays(DEFAULT_DAYS_AHEAD, DEFAULT_APPOINTMENT_TIME);
  const patient = newPortalPatient();

  const response = await postBooking(
    scenario,
    doctorProfileId,
    scheduledAt,
    patient,
  );
  if (!response.ok()) {
    throw new Error(
      `POST /appointment falló (${response.status()}): ${await response.text()}`,
    );
  }

  const prisma = await getTestPrisma();
  const appointment = await prisma.appointment.findFirst({
    where: { doctorProfileId, scheduledAt: wallTimeToInstant(scheduledAt) },
  });
  if (!appointment) throw new Error("La reserva no dejó una cita");

  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    patient,
    doctorProfileId,
    token: await seedAccessToken(appointment.id),
    scheduledAt,
  };
}

export async function readAppointment(
  appointmentId: string,
): Promise<TestPrismaAppointmentRow> {
  const prisma = await getTestPrisma();
  return prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
}

export async function updateAppointment(
  appointmentId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.appointment.update({ where: { id: appointmentId }, data });
}

export async function moveAppointmentTo(
  appointmentId: string,
  wallTime: string,
): Promise<void> {
  await updateAppointment(appointmentId, {
    scheduledAt: wallTimeToInstant(wallTime),
  });
}

export async function countActiveAppointmentsAt(
  doctorProfileId: string,
  wallTime: string,
): Promise<number> {
  const prisma = await getTestPrisma();
  const instant = wallTimeToInstant(wallTime);
  return prisma.appointment.count({
    where: {
      doctorProfileId,
      scheduledAt: instant,
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
    },
  });
}

export const DEFAULT_CANCELLATION_REASON = "CANNOT_MAKE_IT";

export interface PortalClient {
  get(token: string): Promise<APIResponse>;
  cancel(token: string, data?: unknown): Promise<APIResponse>;
  reschedule(token: string, data: unknown): Promise<APIResponse>;
  slots(token: string, query?: string): Promise<APIResponse>;
  hasSlots(token: string): Promise<APIResponse>;
  postRaw(path: string, body: string): Promise<APIResponse>;
}

export async function createPortalClient(): Promise<PortalClient> {
  const context: APIRequestContext = await createApiContext();
  const base = `${API_BASE_URL}/appointment/manage`;
  return {
    get: (token) => context.get(`${base}/${token}`),
    cancel: (token, data) =>
      context.post(`${base}/${token}/cancel`, {
        data: { reason: DEFAULT_CANCELLATION_REASON, ...(data ?? {}) },
      }),
    reschedule: (token, data) =>
      context.post(`${base}/${token}/reschedule`, { data }),
    slots: (token, query = "") => context.get(`${base}/${token}/slots${query}`),
    hasSlots: (token) => context.get(`${base}/${token}/has-slots`),
    postRaw: (path, body) =>
      context.post(`${base}/${path}`, {
        headers: { "content-type": "application/json" },
        data: body,
      }),
  };
}

export const LINK_UNAVAILABLE_MESSAGE = "Este enlace ya no está disponible.";
export const NO_STORE_CACHE_CONTROL = "private, no-store";
