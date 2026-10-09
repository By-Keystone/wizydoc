import { randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeededMember,
} from "./accounts";
import { getTestPrisma, type TestPrismaAppointmentRow } from "./db";
import { API_BASE_URL, PLATFORM_BASE_URL } from "./env";
import { extractLink, readEmailsTo, type CapturedEmail } from "./email";
import { expect } from "./test";
import { uniqueEmail, uniqueName } from "./users";
import { daysFromToday } from "./dates";

export const BOOKING_DAYS_AHEAD = 14;
export const BOOKING_TIME = "10:00";
export const SLOT_DURATION_MINUTES = 30;
export const MANAGE_LINK_PATH = "/appointment/manage/";
export const LINK_UNAVAILABLE_MESSAGE = "Este enlace ya no está disponible.";

const LIMA_UTC_OFFSET_HOURS = 5;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MILLISECONDS_PER_SLOT = SLOT_DURATION_MINUTES * 60 * 1000;

export interface AvailabilityRange {
  startTime: string;
  endTime: string;
}

const FULL_DAY: AvailabilityRange = { startTime: "00:00", endTime: "23:30" };

export interface ClinicWorkspace {
  admin: OnboardedAdmin;
  accountId: string;
  organizationId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  specialtyId: string;
  specialtyName: string;
}

export interface BookableDoctor extends ClinicWorkspace {
  doctor: SeededMember;
  doctorProfileId: string;
  doctorFullName: string;
}

export async function createClinicWorkspace(
  label: string,
): Promise<ClinicWorkspace> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicName = uniqueName(`Sede ${label}`);
  const clinicAddress = `Av. Prueba ${Math.floor(Math.random() * 900) + 100}`;
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
    address: clinicAddress,
  });
  const specialtyName = uniqueName("Medicina general");
  const specialtyId = await createSpecialty(
    admin,
    organizationId,
    specialtyName,
  );

  return {
    admin,
    accountId: admin.accountId,
    organizationId,
    clinicId,
    clinicName,
    clinicAddress,
    specialtyId,
    specialtyName,
  };
}

export async function addBookableDoctor(
  workspace: ClinicWorkspace,
  label: string,
  availability: AvailabilityRange = FULL_DAY,
): Promise<
  Pick<BookableDoctor, "doctor" | "doctorProfileId" | "doctorFullName">
> {
  const doctor = await createMemberWithRole({
    accountId: workspace.accountId,
    resourceId: workspace.clinicId,
    role: "DOCTOR",
    createdBy: workspace.admin.userId,
    emailPrefix: `doctor-${label}`,
    name: "Ernesto",
    lastName: "Salazar",
  });

  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.create({
    data: {
      userId: doctor.userId,
      clinicId: workspace.clinicId,
      specialties: { connect: [{ id: workspace.specialtyId }] },
    },
  });
  await prisma.availability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      doctorProfileId: profile.id,
      dayOfWeek,
      ...availability,
    })),
  });

  return {
    doctor,
    doctorProfileId: profile.id,
    doctorFullName: `${doctor.name} ${doctor.lastName}`,
  };
}

export async function seedBookableDoctor(
  label: string,
  availability: AvailabilityRange = FULL_DAY,
): Promise<BookableDoctor> {
  const workspace = await createClinicWorkspace(label);
  const doctor = await addBookableDoctor(workspace, label, availability);
  return { ...workspace, ...doctor };
}

export interface PatientIdentity {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  documentNumber: string;
  birthDate: string;
}

function randomDigits(length: number): string {
  return randomUUID().replace(/\D/g, "").padEnd(length, "7").slice(0, length);
}

function randomLetters(length: number): string {
  return randomUUID()
    .replace(/[^a-f]/g, "")
    .padEnd(length, "q")
    .slice(0, length);
}

export function newPatient(): PatientIdentity {
  return {
    name: "Camila",
    lastName: `Rivas${randomLetters(6)}`,
    email: uniqueEmail("paciente"),
    phone: `+519${randomDigits(8)}`,
    documentNumber: randomDigits(8),
    birthDate: "1990-05-20",
  };
}

export interface BookingTarget {
  clinicId: string;
  doctorProfileId: string;
  specialtyName: string;
}

export function bookingDate(daysAhead: number = BOOKING_DAYS_AHEAD): string {
  return daysFromToday(daysAhead);
}

export function bookingBody(
  target: BookingTarget,
  patient: PatientIdentity,
  when: { date: string; time: string },
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    patientName: patient.name,
    patientLastName: patient.lastName,
    patientPhone: patient.phone,
    patientEmail: patient.email,
    patientDocumentType: "DNI",
    patientDocumentNumber: patient.documentNumber,
    patientBirthDate: patient.birthDate,
    specialty: target.specialtyName,
    durationMinutes: SLOT_DURATION_MINUTES,
    scheduledAt: `${when.date}T${when.time}`,
    doctorProfileId: target.doctorProfileId,
    clinicId: target.clinicId,
    ...overrides,
  };
}

export async function postBooking(
  target: BookingTarget,
  patient: PatientIdentity,
  when: { date: string; time: string },
  overrides: Record<string, unknown> = {},
): Promise<APIResponse> {
  const api = await createApiContext();
  return api.post(`${API_BASE_URL}/appointment`, {
    data: bookingBody(target, patient, when, overrides),
  });
}

export function readManageLink(email: string): string {
  const confirmation = readEmailsTo(email)
    .reverse()
    .find((captured) => captured.html.includes(MANAGE_LINK_PATH));
  if (!confirmation) {
    throw new Error(`No hay un correo con enlace de autogestión para ${email}`);
  }
  return extractLink(confirmation.html, MANAGE_LINK_PATH);
}

export function tokenOf(manageLink: string): string {
  return new URL(manageLink).pathname.split("/").at(-1) ?? "";
}

export interface BookedAppointment {
  patient: PatientIdentity;
  date: string;
  time: string;
  manageLink: string;
  token: string;
  appointmentId: string;
}

export async function bookAppointment(
  target: BookingTarget,
  options: {
    patient?: PatientIdentity;
    date?: string;
    time?: string;
  } = {},
): Promise<BookedAppointment> {
  const patient = options.patient ?? newPatient();
  const date = options.date ?? bookingDate();
  const time = options.time ?? BOOKING_TIME;

  const response = await postBooking(target, patient, { date, time });
  if (response.status() !== 200) {
    throw new Error(
      `POST /appointment falló (${response.status()}): ${await response.text()}`,
    );
  }

  const manageLink = readManageLink(patient.email);
  const appointment = await findAppointmentOf(patient.email, target);

  return {
    patient,
    date,
    time,
    manageLink,
    token: tokenOf(manageLink),
    appointmentId: appointment.id,
  };
}

export async function findAppointmentOf(
  patientEmail: string,
  target: Pick<BookingTarget, "doctorProfileId">,
): Promise<TestPrismaAppointmentRow> {
  const prisma = await getTestPrisma();
  const appointment = await prisma.appointment.findFirst({
    where: {
      doctorProfileId: target.doctorProfileId,
      patient: { email: patientEmail },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!appointment) {
    throw new Error(`No se encontró la cita de ${patientEmail}`);
  }
  return appointment;
}

export async function appointmentRow(
  appointmentId: string,
): Promise<TestPrismaAppointmentRow> {
  const prisma = await getTestPrisma();
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId },
  });
  if (!appointment) throw new Error(`No existe la cita ${appointmentId}`);
  return appointment;
}

export async function updateAppointment(
  appointmentId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.appointment.update({ where: { id: appointmentId }, data });
}

export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * MILLISECONDS_PER_HOUR);
}

export function limaWall(instant: Date): { date: string; time: string } {
  const shifted = new Date(
    instant.getTime() - LIMA_UTC_OFFSET_HOURS * MILLISECONDS_PER_HOUR,
  ).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

export function instantAtWall(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-0${LIMA_UTC_OFFSET_HOURS}:00`);
}

export function slotAfterHours(hours: number): { date: string; time: string } {
  const target = hoursFromNow(hours).getTime();
  const rounded =
    Math.ceil(target / MILLISECONDS_PER_SLOT) * MILLISECONDS_PER_SLOT;
  return limaWall(new Date(rounded));
}

export function formatWall(date: string, time: string): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T${time}:00Z`));
}

const LONG_DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const LONG_MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function longDate(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return `${LONG_DAY_NAMES[day.getUTCDay()]} ${day.getUTCDate()} de ${LONG_MONTH_NAMES[day.getUTCMonth()]}`;
}

export function whenText(date: string, time: string): string {
  const text = longDate(date);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}, ${time}`;
}

export interface ManageClient {
  get(token: string): Promise<APIResponse>;
  cancel(token: string): Promise<APIResponse>;
  reschedule(token: string, body: unknown): Promise<APIResponse>;
}

export async function createManageClient(): Promise<ManageClient> {
  const api: APIRequestContext = await createApiContext();
  const url = (token: string, action = "") =>
    `${API_BASE_URL}${MANAGE_LINK_PATH}${token}${action}`;

  return {
    get: (token) => api.get(url(token)),
    cancel: (token) => api.post(url(token, "/cancel"), { data: {} }),
    reschedule: (token, body) =>
      api.post(url(token, "/reschedule"), { data: body }),
  };
}

export function rescheduleBody(when: { date: string; time: string }) {
  return { scheduledAt: `${when.date}T${when.time}` };
}

export async function fetchSlots(
  doctorProfileId: string,
  date: string,
): Promise<string[]> {
  const api = await createApiContext();
  const response = await api.get(
    `${API_BASE_URL}/doctor-profile/${doctorProfileId}/slots?from=${date}&to=${date}`,
  );
  expect(response.status()).toBe(200);
  const { days } = (await response.json()) as {
    days: Record<string, string[]>;
  };
  return days[date] ?? [];
}

export function emailsWithSubject(
  address: string,
  subject: RegExp | string,
): CapturedEmail[] {
  return readEmailsTo(address).filter((captured) =>
    typeof subject === "string"
      ? captured.subject.includes(subject)
      : subject.test(captured.subject),
  );
}

export const CHANGE_NOTICE_SUBJECT = /cancel|reprogram|cambió de horario/i;

export function countChangeNotices(address: string): number {
  return emailsWithSubject(address, CHANGE_NOTICE_SUBJECT).length;
}

const MAX_WEEKS_TO_SCAN = 60;

export async function openDayInPicker(page: Page, date: string): Promise<void> {
  const dayButton = page.getByRole("button", {
    name: longDate(date),
    exact: true,
  });

  for (let week = 0; week < MAX_WEEKS_TO_SCAN; week++) {
    if ((await dayButton.count()) > 0) break;
    await page.getByRole("button", { name: "Semana siguiente" }).click();
  }

  await expect(dayButton).toBeEnabled();
  await dayButton.click();
}

export async function pickSlotInPicker(
  page: Page,
  date: string,
  time: string,
): Promise<void> {
  await openDayInPicker(page, date);
  await page.getByRole("button", { name: time, exact: true }).click();
}

export async function expectNoSlot(page: Page, time: string): Promise<void> {
  await expect(
    page.getByRole("button", { name: time, exact: true }),
  ).toHaveCount(0);
}

export async function openPanelAs(
  page: Page,
  member: SeededMember,
  workspace: Pick<ClinicWorkspace, "accountId" | "clinicId">,
  path: string,
): Promise<void> {
  const { loginViaUi } = await import("./ui");
  await loginViaUi(
    page,
    member.email,
    new RegExp(`/account/${workspace.accountId}/select$`),
  );
  await page.context().addCookies([
    {
      name: "resource_id",
      value: workspace.clinicId,
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
    {
      name: "resource_type",
      value: "CLINIC",
      url: PLATFORM_BASE_URL,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    `/account/${workspace.accountId}/clinic/${workspace.clinicId}${path}`,
  );
}
