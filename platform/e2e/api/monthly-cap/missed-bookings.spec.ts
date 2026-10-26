import { randomUUID } from "node:crypto";
import {
  createClinicResourceViaPrisma,
  createMemberWithRole,
} from "../../support/accounts";
import {
  limaWallTimeInDays,
  newPortalPatient,
  wallTimeToInstant,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  addListedClinic,
  addTeamMember,
  countMissedBookings,
  createListedClinic,
  postAnonymously,
  postBookingTo,
  readMissedBookings,
  seedMissedBookings,
  slotInDays,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-64 (parte api), CA-65 y CA-69.

const MISSED_PATH = (clinicId: string) => `/clinic/${clinicId}/missed-bookings`;
const NO_STORE = "private, no-store";
const ROW_TOLERANCE_MS = 60_000;
const MISSED_BOOKINGS_PER_CLINIC_PER_DAY = 50;

test("CA-69: responde 204 y registra la reserva perdida en la cuenta y la sede de la URL, sin hacer caso de ids ajenos en el cuerpo", async () => {
  const world = await createListedClinic("missed-ca69", { booked: 10 });
  const other = await createListedClinic("missed-ca69-otra", { booked: 10 });

  const response = await postAnonymously(MISSED_PATH(world.clinicId), {
    accountId: other.accountId,
    clinicId: other.clinicId,
  });

  expect(response.status()).toBe(204);
  expect(response.headers()["cache-control"]).toBe(NO_STORE);
  const rows = await readMissedBookings(world.accountId);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    accountId: world.accountId,
    clinicId: world.clinicId,
  });
  expect(await countMissedBookings(other.accountId)).toBe(0);
});

test("CA-69: el id de una organización o un UUID inexistente dan 404, un id que no es UUID da 400, y 204 y 404 llevan Cache-Control", async () => {
  const world = await createListedClinic("missed-ca69-ids", { booked: 10 });

  for (const unknownId of [world.organizationId, randomUUID()]) {
    const response = await postAnonymously(MISSED_PATH(unknownId));

    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe(NO_STORE);
  }
  const notUuid = await postAnonymously(MISSED_PATH("no-es-un-uuid"));
  expect(notUuid.status()).toBe(400);
  expect(await countMissedBookings(world.accountId)).toBe(0);
});

test("CA-64: la cookie de la cuenta, una sede sin médicos y el link abierto responden 204 y no registran nada; una sesión de otra cuenta sí cuenta", async () => {
  const world = await createListedClinic("missed-ca64", { booked: 10 });
  const open = await createListedClinic("missed-ca64-abierta", { booked: 3 });
  const outsider = await createListedClinic("missed-ca64-visitante");
  const doctor = await addTeamMember(world, "DOCTOR");
  const user = await addTeamMember(world, "USER");
  const withoutDoctors = await createClinicResourceViaPrisma(
    world.owner,
    world.organizationId,
  );
  const path = MISSED_PATH(world.clinicId);

  const sameAccountVisitors = [world.owner, doctor, user];
  for (const visitor of sameAccountVisitors) {
    const response = await visitor.context.post(`${API_BASE_URL}${path}`);

    expect(response.status()).toBe(204);
  }
  const noDoctors = await postAnonymously(MISSED_PATH(withoutDoctors));
  expect(noDoctors.status()).toBe(204);
  const linkOpen = await postAnonymously(MISSED_PATH(open.clinicId));
  expect(linkOpen.status()).toBe(204);

  expect(await countMissedBookings(world.accountId)).toBe(0);
  expect(await countMissedBookings(open.accountId)).toBe(0);

  const foreignSession = await outsider.owner.context.post(
    `${API_BASE_URL}${path}`,
  );
  expect(foreignSession.status()).toBe(204);
  expect(await countMissedBookings(world.accountId)).toBe(1);
});

test("CA-64: el ADMIN de la sede, no solo el dueño, tampoco cuenta como paciente", async () => {
  const world = await createListedClinic("missed-ca64-admin", { booked: 10 });
  const admin = await createMemberWithRole({
    accountId: world.accountId,
    resourceId: world.clinicId,
    role: "ADMIN",
    createdBy: world.owner.userId,
    emailPrefix: "missed-admin",
  });

  const response = await admin.context.post(
    `${API_BASE_URL}${MISSED_PATH(world.clinicId)}`,
  );

  expect(response.status()).toBe(204);
  expect(await countMissedBookings(world.accountId)).toBe(0);
});

test("CA-65: la reserva perdida guarda solo la cuenta, la sede y el momento, y la tabla no tiene más columnas", async () => {
  const world = await createListedClinic("missed-ca65", { booked: 10 });
  const patient = newPortalPatient();

  const response = await postBookingTo(world, slotInDays(2), patient);

  expect(response.status()).toBe(409);
  const rows = await readMissedBookings(world.accountId);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(Object.keys(row).sort()).toEqual([
    "accountId",
    "clinicId",
    "createdAt",
    "id",
  ]);
  expect(row.accountId).toBe(world.accountId);
  expect(row.clinicId).toBe(world.clinicId);
  expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(
    ROW_TOLERANCE_MS,
  );
  const stored = JSON.stringify(row);
  for (const personalData of [
    patient.name,
    patient.lastName,
    patient.email,
    patient.documentNumber,
    patient.phone,
    world.doctorProfileId,
    world.specialtyName,
  ]) {
    expect(stored).not.toContain(personalData);
  }
  const prisma = await getTestPrisma();
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'missed_booking' ORDER BY column_name`;
  expect(columns.map(({ column_name }) => column_name)).toEqual([
    "account_id",
    "clinic_id",
    "created_at",
    "id",
  ]);
});

test("CA-69: la ruta pública no revela si contó: la misma respuesta con y sin tope", async () => {
  const closed = await createListedClinic("missed-ca69-igual-a", {
    booked: 10,
  });
  const open = await createListedClinic("missed-ca69-igual-b");

  const counted = await postAnonymously(MISSED_PATH(closed.clinicId));
  const ignored = await postAnonymously(MISSED_PATH(open.clinicId));

  expect(counted.status()).toBe(204);
  expect(ignored.status()).toBe(204);
  expect(await counted.text()).toBe(await ignored.text());
  expect(await countMissedBookings(closed.accountId)).toBe(1);
  expect(await countMissedBookings(open.accountId)).toBe(0);
});

test("una sede registra como mucho 50 reservas perdidas por día de Lima: la 51 responde 204 y no se guarda, otra sede y el día anterior no cuentan", async () => {
  const world = await createListedClinic("missed-tope-diario", { booked: 10 });
  const sibling = await addListedClinic(world);
  const yesterdayNoon = wallTimeToInstant(limaWallTimeInDays(-1, "12:00"));
  await seedMissedBookings(
    world.accountId,
    world.clinicId,
    MISSED_BOOKINGS_PER_CLINIC_PER_DAY,
  );

  const overTheLimit = await postAnonymously(MISSED_PATH(world.clinicId));

  expect(overTheLimit.status()).toBe(204);
  expect(await countMissedBookings(world.accountId)).toBe(
    MISSED_BOOKINGS_PER_CLINIC_PER_DAY,
  );

  const otherClinic = await postAnonymously(MISSED_PATH(sibling.clinicId));

  expect(otherClinic.status()).toBe(204);
  expect(await countMissedBookings(world.accountId)).toBe(
    MISSED_BOOKINGS_PER_CLINIC_PER_DAY + 1,
  );

  const yesterdays = await createListedClinic("missed-tope-diario-ayer", {
    booked: 10,
  });
  await seedMissedBookings(
    yesterdays.accountId,
    yesterdays.clinicId,
    MISSED_BOOKINGS_PER_CLINIC_PER_DAY,
    yesterdayNoon,
  );

  const today = await postAnonymously(MISSED_PATH(yesterdays.clinicId));

  expect(today.status()).toBe(204);
  expect(await countMissedBookings(yesterdays.accountId)).toBe(
    MISSED_BOOKINGS_PER_CLINIC_PER_DAY + 1,
  );
});
