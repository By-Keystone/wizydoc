import { randomInt } from "node:crypto";
import type {
  APIRequestContext,
  APIResponse,
  Locator,
  Page,
} from "@playwright/test";
import { expect } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeededMember,
} from "./accounts";
import {
  addPortalDoctor,
  limaWallTime,
  limaWallTimeInDays,
  newPortalPatient,
  type PortalPatient,
} from "./appointment-portal";
import { seedFullDayAvailability } from "./availability";
import { getTestPrisma } from "./db";
import { readEmailsTo } from "./email";
import { API_BASE_URL } from "./env";
import {
  addListedDoctor,
  copyLinkButton,
  createOwnerWithFirstClinic,
  openClinicDashboard,
} from "./first-use";
import { ONBOARDING_ADDRESS } from "./ui";
import { uniqueEmail, uniqueName } from "./users";

export type PlanKey = "FREE" | "CONSULTORIO" | "CLINICA" | "RED";

export const PLAN_LABELS: Record<PlanKey, string> = {
  FREE: "Gratis",
  CONSULTORIO: "Consultorio",
  CLINICA: "Clínica",
  RED: "Red",
};

export const PLAN_CAPS: Record<PlanKey, number | null> = {
  FREE: 10,
  CONSULTORIO: 150,
  CLINICA: 600,
  RED: null,
};

export const BOOKING_CLOSED_MESSAGE =
  "Este consultorio no está recibiendo reservas en línea por ahora";
export const BOOKING_CLOSED_BODY = {
  message: BOOKING_CLOSED_MESSAGE,
  code: "BOOKING_CLOSED",
};
export const INVALID_CONTACT_MESSAGE =
  "Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.";
export const NO_DOCTORS_MESSAGE =
  "Esta sede todavía no tiene médicos disponibles para reservar citas.";

export const MOBILE_CONTACT = "+51987654321";
export const LIMA_LANDLINE_CONTACT = "+5112345678";
export const PROVINCE_LANDLINE_CONTACT = "+5144123456";
export const OTHER_MOBILE_CONTACT = "+51955123456";

export const WIZYDOC_WHATSAPP_ORIGIN = "https://wa.me";
export const WIZYDOC_WHATSAPP_PATH = "/51993953674";
export const REACHED_NOTICE_SUBJECT =
  "Tu link de reservas ya no recibe citas este mes";
export const DEFAULT_SLOT_TIME = "10:00";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const BEACON_SETTLE_MS = 1_500;
const DOCUMENT_NUMBER_DIGITS = 8;
const ONE_HUNDRED_MILLION = 100_000_000;

export function warningNoticeSubject(booked: number, cap: number): string {
  return `Llevas ${booked} de las ${cap} citas de tu plan este mes`;
}

export function limaToday(): string {
  return limaWallTime(new Date()).slice(0, 10);
}

export function currentMonth(): string {
  return limaToday().slice(0, 7);
}

function shiftMonth(month: string, months: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + months, 1))
    .toISOString()
    .slice(0, 7);
}

export const previousMonth = () => shiftMonth(currentMonth(), -1);
export const nextMonth = () => shiftMonth(currentMonth(), 1);

export function monthName(month: string): string {
  return new Intl.DateTimeFormat("es", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export const renewalDay = () => `1 de ${monthName(nextMonth())}`;

export function daysUntilNextMonth(): number {
  return Math.round(
    (Date.parse(`${nextMonth()}-01`) - Date.parse(limaToday())) /
      MILLISECONDS_PER_DAY,
  );
}

export function lastMinuteOfPreviousMonth(): Date {
  const lastDay = new Date(
    Date.parse(`${currentMonth()}-01`) - MILLISECONDS_PER_DAY,
  )
    .toISOString()
    .slice(0, 10);
  return new Date(`${lastDay}T23:59:00-05:00`);
}

export function firstMinuteOfCurrentMonth(): Date {
  return new Date(`${currentMonth()}-01T00:00:00-05:00`);
}

export async function setMonthlyBookings(
  accountId: string,
  booked: number,
  month: string = currentMonth(),
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.accountMonthlyBookings.upsert({
    where: { accountId_month: { accountId, month } },
    create: { accountId, month, booked },
    update: { booked },
  });
}

export async function readMonthlyBookings(
  accountId: string,
  month: string = currentMonth(),
): Promise<number> {
  const prisma = await getTestPrisma();
  const row = await prisma.accountMonthlyBookings.findUnique({
    where: { accountId_month: { accountId, month } },
  });
  return row?.booked ?? 0;
}

export async function seedMissedBookings(
  accountId: string,
  clinicId: string,
  count: number,
  createdAt: Date = new Date(),
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.missedBooking.createMany({
    data: Array.from({ length: count }, () => ({
      accountId,
      clinicId,
      createdAt,
    })),
  });
}

export async function countMissedBookings(accountId: string): Promise<number> {
  const prisma = await getTestPrisma();
  return prisma.missedBooking.count({ where: { accountId } });
}

export async function readMissedBookings(accountId: string) {
  const prisma = await getTestPrisma();
  return prisma.missedBooking.findMany({ where: { accountId } });
}

export async function setPlan(
  accountId: string,
  plan: PlanKey,
  status: "ACTIVE" | "CANCELLED" = "ACTIVE",
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId },
    data: { plan, status },
  });
}

export async function removeSubscription(accountId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.subscription.delete({ where: { accountId } });
}

export async function setPatientContact(
  clinicId: string,
  patientContact: string | null,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.clinic.update({
    where: { resourceId: clinicId },
    data: { patientContact },
  });
}

export async function readPatientContact(
  clinicId: string,
): Promise<string | null> {
  const prisma = await getTestPrisma();
  const clinic = await prisma.clinic.findFirst({
    where: { resourceId: clinicId },
  });
  if (!clinic) throw new Error(`La sede ${clinicId} no existe`);
  return clinic.patientContact;
}

export interface BookableClinic {
  clinicId: string;
  doctorProfileId: string;
  specialtyName: string;
}

export interface ListedClinic extends BookableClinic {
  owner: OnboardedAdmin;
  accountId: string;
  organizationId: string;
  clinicName: string;
  address: string;
}

export interface ListedClinicOptions {
  plan?: PlanKey;
  booked?: number;
  patientContact?: string;
  clinicName?: string;
  address?: string;
  specialty?: string;
}

// El nombre por defecto evita las palabras «plan» y «Consultorio»: la página del paciente no debe contenerlas.
export async function createListedClinic(
  label: string,
  options: ListedClinicOptions = {},
): Promise<ListedClinic> {
  const clinicName = options.clinicName ?? uniqueName("Sede Paredes");
  const address = options.address ?? ONBOARDING_ADDRESS;
  const { owner, organizationId, clinicId, body } =
    await createOwnerWithFirstClinic({
      emailPrefix: label,
      body: {
        name: clinicName,
        address,
        ...(options.specialty && { specialty: options.specialty }),
      },
    });
  const doctorProfileId = await seedFullDayAvailability(owner.userId, clinicId);

  if (options.plan) await setPlan(owner.accountId, options.plan);
  if (options.booked !== undefined) {
    await setMonthlyBookings(owner.accountId, options.booked);
  }
  if (options.patientContact) {
    await setPatientContact(clinicId, options.patientContact);
  }

  return {
    owner,
    accountId: owner.accountId,
    organizationId,
    clinicId,
    clinicName,
    address,
    doctorProfileId,
    specialtyName: body.specialty,
  };
}

export async function addSecondDoctor(
  world: ListedClinic,
): Promise<BookableClinic> {
  const { doctor, specialtyName } = await addListedDoctor(
    world.owner,
    world.organizationId,
    world.clinicId,
  );
  return {
    clinicId: world.clinicId,
    doctorProfileId: doctor.doctorProfileId,
    specialtyName,
  };
}

export interface ExtraClinic extends BookableClinic {
  organizationId: string;
  clinicName: string;
}

// Se crea por Prisma: el plan Gratis limita a una sede por api.
export async function addListedClinic(
  world: ListedClinic,
  options: { inNewOrganization?: boolean; patientContact?: string } = {},
): Promise<ExtraClinic> {
  const organizationId = options.inNewOrganization
    ? await createOrganizationResource(world.owner, uniqueName("ORG-segunda"))
    : world.organizationId;
  const clinicName = uniqueName("Sede Lozano");
  const clinicId = await createClinicResourceViaPrisma(
    world.owner,
    organizationId,
    { name: clinicName },
  );
  const specialtyName = uniqueName("Pediatría");
  const specialtyId = await createSpecialty(
    world.owner,
    organizationId,
    specialtyName,
  );
  const doctor = await addPortalDoctor({
    label: "segunda-sede",
    clinicId,
    admin: world.owner,
    specialtyId,
  });
  if (options.patientContact) {
    await setPatientContact(clinicId, options.patientContact);
  }

  return {
    clinicId,
    organizationId,
    clinicName,
    doctorProfileId: doctor.doctorProfileId,
    specialtyName,
  };
}

export type TeamRole = "ADMIN" | "DOCTOR" | "USER";

export async function addTeamMember(
  world: { accountId: string; owner: OnboardedAdmin; clinicId: string },
  role: TeamRole,
  resourceId: string = world.clinicId,
): Promise<SeededMember> {
  const member = await createMemberWithRole({
    accountId: world.accountId,
    resourceId,
    role,
    createdBy: world.owner.userId,
    emailPrefix: `cap-${role.toLowerCase()}`,
  });
  if (role === "DOCTOR") {
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.create({
      data: { membershipId: member.membershipId },
    });
  }
  return member;
}

export function slotInDays(days: number, time: string = DEFAULT_SLOT_TIME) {
  return limaWallTimeInDays(days, time);
}

export function bookingPayload(
  target: BookableClinic,
  scheduledAt: string,
  patient: PortalPatient = newPortalPatient(),
) {
  return {
    patientName: patient.name,
    patientLastName: patient.lastName,
    patientPhone: patient.phone,
    patientEmail: patient.email,
    patientDocumentNumber: patient.documentNumber,
    patientDocumentType: "DNI",
    patientBirthDate: patient.birthDate,
    durationMinutes: 30,
    scheduledAt,
    doctorProfileId: target.doctorProfileId,
    clinicId: target.clinicId,
    specialty: target.specialtyName,
  };
}

export async function postBookingTo(
  target: BookableClinic,
  scheduledAt: string,
  patient: PortalPatient = newPortalPatient(),
): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}/appointment`, {
    data: bookingPayload(target, scheduledAt, patient),
  });
}

export async function bookSuccessfully(
  target: BookableClinic,
  days: number,
  patient: PortalPatient = newPortalPatient(),
): Promise<PortalPatient> {
  const response = await postBookingTo(target, slotInDays(days), patient);
  if (response.status() !== 200) {
    throw new Error(
      `POST /appointment falló (${response.status()}): ${await response.text()}`,
    );
  }
  return patient;
}

export async function bookSeveral(
  targets: BookableClinic[],
  count: number,
  firstDay = 2,
): Promise<PortalPatient[]> {
  const patients: PortalPatient[] = [];
  for (let index = 0; index < count; index++) {
    const target = targets[index % targets.length];
    const day = firstDay + Math.floor(index / targets.length);
    patients.push(await bookSuccessfully(target, day));
  }
  return patients;
}

export async function getAnonymously(path: string): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.get(`${API_BASE_URL}${path}`);
}

export async function postAnonymously(
  path: string,
  data?: Record<string, unknown>,
): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}${path}`, data ? { data } : undefined);
}

export interface BookingStatusBody {
  isAcceptingBookings: boolean;
  patientContact: string | null;
}

export async function fetchBookingStatus(
  clinicId: string,
): Promise<BookingStatusBody> {
  const response = await getAnonymously(`/clinic/${clinicId}/booking-status`);
  expect(response.status()).toBe(200);
  return response.json();
}

export interface BookingUsageBody {
  plan: PlanKey;
  monthlyCap: number | null;
  month: string;
  renewsOn: string;
  bookedThisMonth: number;
  missedThisMonth: number;
  nextPlan: { plan: PlanKey; monthlyCap: number | null } | null;
  patientContact: string | null;
}

export async function fetchUsage(
  context: APIRequestContext,
  clinicId: string,
): Promise<BookingUsageBody> {
  const response = await context.get(
    `${API_BASE_URL}/clinic/${clinicId}/booking-usage`,
  );
  expect(response.status()).toBe(200);
  return response.json();
}

export function putPatientContact(
  context: APIRequestContext,
  resourceId: string,
  body: Record<string, unknown>,
): Promise<APIResponse> {
  return context.put(`${API_BASE_URL}/clinic/${resourceId}/patient-contact`, {
    data: body,
  });
}

// El api espera el envío antes de responder: no hace falta una ventana de espera para afirmar que no llegó.
export function emailsWithSubject(email: string, subject: string) {
  return readEmailsTo(email).filter((sent) => sent.subject === subject);
}

export function visibleEmailText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const closedHeading = (page: Page) =>
  page.getByRole("heading", {
    level: 2,
    name: BOOKING_CLOSED_MESSAGE,
    exact: true,
  });

const USAGE_TITLE =
  /^(Citas reservadas en |Llevas \d+ de las \d+ citas de tu plan en |Llegaste al tope de )/;

export const usageCard = (page: Page) =>
  page.getByRole("region", { name: USAGE_TITLE });

export const planRequestLinks = (scope: Page | Locator) =>
  scope.getByRole("link", { name: /^Pedir el plan / });

export const planRequestLink = (scope: Page | Locator, planLabel: string) =>
  scope.getByRole("link", { name: new RegExp(`^Pedir el plan ${planLabel}`) });

export const addNumberButton = (scope: Page | Locator) =>
  scope.getByRole("button", { name: "Agregar número", exact: true });

export const changeNumberButton = (scope: Page | Locator) =>
  scope.getByRole("button", {
    name: "Cambiar el número para tus pacientes",
    exact: true,
  });

export const contactDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Número para tus pacientes" });

export const contactField = (page: Page) =>
  page.getByLabel("WhatsApp o teléfono para pacientes");

// Para sedes con médicos en el link: sin ellos «Copiar link de reservas» no existe y no hay nada que esperar.
export async function openHome(
  page: Page,
  world: { accountId: string; clinicId: string; owner: OnboardedAdmin },
  email: string = world.owner.email,
  clinicId: string = world.clinicId,
) {
  await page.context().clearCookies();
  await openClinicDashboard(page, {
    email,
    accountId: world.accountId,
    clinicId,
  });
  await expect(copyLinkButton(page)).toBeVisible();
}

export async function reloadHome(page: Page) {
  await page.reload();
  await expect(copyLinkButton(page)).toBeVisible();
}

export const LINK_CLOSED_TEXT = "Tu link no está recibiendo reservas este mes.";
export const ADMIN_CAN_CHANGE_PLAN_TEXT =
  "Un administrador de tu cuenta puede cambiar de plan.";

export async function expectPlanRequestMessage(
  link: Locator,
  expectedMessage: string,
) {
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const href = new URL((await link.getAttribute("href")) ?? "");
  expect(href.origin).toBe(WIZYDOC_WHATSAPP_ORIGIN);
  expect(href.pathname).toBe(WIZYDOC_WHATSAPP_PATH);
  expect(href.searchParams.get("text")).toBe(expectedMessage);
}

export function planRequestMessage(
  who: { name: string; lastName: string; email: string },
  clinicName: string,
  planLabel: string,
): string {
  return `Hola, soy ${who.name} ${who.lastName} (${who.email}), de ${clinicName}. Quiero activar el plan ${planLabel} en WizyDoc.`;
}

export interface PatientDetails {
  name: string;
  lastName: string;
  documentNumber: string;
  birthDate: string;
  phone: string;
  email: string;
}

export function newPatientDetails(): PatientDetails {
  return {
    name: "Camila",
    lastName: "Rivas",
    documentNumber: String(randomInt(ONE_HUNDRED_MILLION)).padStart(
      DOCUMENT_NUMBER_DIGITS,
      "0",
    ),
    birthDate: "1990-05-20",
    phone: "988888888",
    email: uniqueEmail("paciente-cierre"),
  };
}

export async function fillPatientDetails(page: Page, details: PatientDetails) {
  await page.getByLabel("Nombre").fill(details.name);
  await page.getByLabel("Apellido").fill(details.lastName);
  await page.getByLabel("N° de documento").fill(details.documentNumber);
  await page.getByLabel("Fecha de nacimiento").fill(details.birthDate);
  await page.getByLabel("Teléfono").fill(details.phone);
  await page.getByLabel("Email").fill(details.email);
}

export async function readMissedBookingMarks(
  page: Page,
): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("missed-booking:"),
      ),
    ),
  );
}

export async function waitForBeaconToSettle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, BEACON_SETTLE_MS));
}

export async function expectMissedBookings(
  accountId: string,
  expected: number,
) {
  await expect.poll(() => countMissedBookings(accountId)).toBe(expected);
}

export async function expectMissedBookingsStay(
  accountId: string,
  expected: number,
) {
  await waitForBeaconToSettle();
  expect(await countMissedBookings(accountId)).toBe(expected);
}

const PLAN_TALK = /plan/i;
const PLAN_NAMES_AS_WORDS = /\b(Gratis|Consultorio|Clínica|Red)\b/;
const CAP_TALK = /tope|límite|citas al mes/i;
const ERROR_TALK = /error|Algo salió mal/i;
const CAPITAL_ASK = /\bPedir\b/;
const COUNTS_OF_APPOINTMENTS = /\b\d+ de \d+\b|\b\d+ citas?\b/;

// Lo que el paciente lee y lo que un lector de pantalla anuncia: texto visible más aria-label, title y alt.
export async function expectNoPlanTalk(page: Page): Promise<void> {
  const announced = await page.evaluate(() => {
    const labelled = [
      ...document.querySelectorAll("[aria-label], [title], img[alt]"),
    ].flatMap((element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
    ]);
    return [document.body.innerText, ...labelled].join("\n");
  });

  for (const forbidden of [
    PLAN_TALK,
    PLAN_NAMES_AS_WORDS,
    CAP_TALK,
    ERROR_TALK,
    CAPITAL_ASK,
    COUNTS_OF_APPOINTMENTS,
  ]) {
    expect(announced).not.toMatch(forbidden);
  }
  expect(announced).not.toContain(renewalDay());
  expect(announced).not.toContain(
    "Tu plan no permite hacer uso de esta función",
  );
}
