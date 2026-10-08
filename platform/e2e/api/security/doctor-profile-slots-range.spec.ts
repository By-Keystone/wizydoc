import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { invitePendingUser } from "../../support/invitations";
import { uniqueName } from "../../support/users";

const MAX_RANGE_DAYS = 31;
const MAX_DAYS_IN_THE_PAST = 7;
const MAX_DAYS_AHEAD = 366;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const RANGE_TOO_LONG_MESSAGE = `El rango no puede superar ${MAX_RANGE_DAYS} días`;
const INVALID_DATE_MESSAGE = "La fecha debe ser válida";
const TOO_FAR_PAST_MESSAGE = "La fecha inicial no puede ser anterior";
const TOO_FAR_AHEAD_MESSAGE = "La fecha final no puede superar";

function dateKeyFromToday(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * MILLISECONDS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

function rangeOfDays(dayCount: number, startsInDays = 7) {
  return {
    from: dateKeyFromToday(startsInDays),
    to: dateKeyFromToday(startsInDays + dayCount - 1),
  };
}

const MALFORMED_TIME_BLOCKS = [
  { startTime: "-Infinity:00", endTime: "10:00" },
  { startTime: "08:00", endTime: "Infinity:00" },
  { startTime: "08:00", endTime: "99999:00" },
  { startTime: "abc", endTime: "abc" },
  { startTime: "", endTime: "" },
  { startTime: "22:00", endTime: "02:00" },
];
const VALID_BLOCK = { startTime: "09:00", endTime: "11:00" };
const VALID_BLOCK_SLOTS = ["09:00", "09:30", "10:00", "10:30"];
const SLOW_RESPONSE_MILLISECONDS = 3000;

async function getSlots(
  from: string,
  to: string,
  doctorProfileId: string = randomUUID(),
) {
  const anonymous = await createApiContext();
  return anonymous.get(
    `${API_BASE_URL}/doctor-profile/${doctorProfileId}/slots?from=${from}&to=${to}`,
  );
}

async function createDoctorWithTimeBlocks(
  blocks: { startTime: string; endTime: string }[],
): Promise<string> {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-malformed" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-malformed"),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede-malformed"),
  });
  const specialtyId = await createSpecialty(admin, organizationId);
  const invitation = await invitePendingUser(admin, {
    resourceId: clinicId,
    role: "DOCTOR",
    emailPrefix: "doctor-malformed",
    specialtyIds: [specialtyId],
  });
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirst({
    where: { userId: invitation.userId },
  });
  if (!profile) throw new Error("La invitación no creó el perfil de médico");
  await prisma.availability.createMany({
    data: blocks.flatMap((block) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        doctorProfileId: profile.id,
        dayOfWeek,
        ...block,
      })),
    ),
  });
  return profile.id;
}

async function expectDayCount(
  response: Awaited<ReturnType<typeof getSlots>>,
  dayCount: number,
) {
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { days: Record<string, string[]> };
  expect(Object.keys(body.days)).toHaveLength(dayCount);
}

test.describe("GET /doctor-profile/:id/slots acota el rango", () => {
  test("un rango de un solo día responde 200", async () => {
    const day = dateKeyFromToday(7);
    await expectDayCount(await getSlots(day, day), 1);
  });

  test("un rango de 7 días responde 200", async () => {
    const { from, to } = rangeOfDays(7);
    await expectDayCount(await getSlots(from, to), 7);
  });

  test("la semana en curso, desde hace hasta 6 días, responde 200", async () => {
    const { from, to } = rangeOfDays(7, -6);
    await expectDayCount(await getSlots(from, to), 7);
  });

  test("un rango de 31 días, el máximo, responde 200", async () => {
    const { from, to } = rangeOfDays(MAX_RANGE_DAYS);
    await expectDayCount(await getSlots(from, to), MAX_RANGE_DAYS);
  });

  test("un rango de 32 días responde 400 en español", async () => {
    const { from, to } = rangeOfDays(MAX_RANGE_DAYS + 1);
    const response = await getSlots(from, to);
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(RANGE_TOO_LONG_MESSAGE);
  });

  test("de 0001-01-01 a 9999-12-31 responde 400", async () => {
    const response = await getSlots("0001-01-01", "9999-12-31");
    expect(response.status()).toBe(400);
  });

  test("9999-12-31 responde 400 sin colgar el api", async () => {
    const response = await getSlots("9999-12-31", "9999-12-31");
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(TOO_FAR_AHEAD_MESSAGE);
  });

  test("una fecha inicial anterior a hoy menos 7 días responde 400", async () => {
    const day = dateKeyFromToday(-MAX_DAYS_IN_THE_PAST - 2);
    const response = await getSlots(day, day);
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(TOO_FAR_PAST_MESSAGE);
  });

  test("una fecha final posterior a hoy más 366 días responde 400", async () => {
    const day = dateKeyFromToday(MAX_DAYS_AHEAD + 2);
    const response = await getSlots(day, day);
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(TOO_FAR_AHEAD_MESSAGE);
  });

  test("una fecha imposible responde 400 en español", async () => {
    const response = await getSlots("2026-02-30", "2026-03-02");
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain(INVALID_DATE_MESSAGE);
  });

  test("los bloques malformados no generan huecos ni cuelgan el api", async () => {
    const doctorProfileId = await createDoctorWithTimeBlocks([
      ...MALFORMED_TIME_BLOCKS,
      VALID_BLOCK,
    ]);
    const { from, to } = rangeOfDays(7);

    const startedAt = Date.now();
    const response = await getSlots(from, to, doctorProfileId);
    expect(Date.now() - startedAt).toBeLessThan(SLOW_RESPONSE_MILLISECONDS);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { days: Record<string, string[]> };
    expect(Object.keys(body.days)).toHaveLength(7);
    for (const slots of Object.values(body.days)) {
      expect(slots).toEqual(VALID_BLOCK_SLOTS);
    }
  });

  test("el endpoint público availability ya no responde", async () => {
    const anonymous = await createApiContext();
    const response = await anonymous.get(
      `${API_BASE_URL}/doctor-profile/${randomUUID()}/availability`,
    );
    expect(response.ok()).toBe(false);
    expect(await response.text()).not.toContain("dayOfWeek");
  });
});
