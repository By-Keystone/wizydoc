import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import {
  countActiveAppointmentsAt,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTime,
  limaWallTimeInDays,
  newPortalPatient,
  readAppointment,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  bookingPayload,
  bookSuccessfully,
  countMissedBookings,
  createListedClinic,
  daysUntilNextMonth,
  fetchBookingStatus,
  fetchUsage,
  nextMonth,
  postBookingTo,
  readMonthlyBookings,
  setMonthlyBookings,
  setPlan,
  slotInDays,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-3 a CA-6 y CA-8.

const PAST_THE_MONTH = 2;
const FAR_AWAY_DAYS = 300;
const SLOT_UNAVAILABLE_MESSAGE =
  "Ese horario ya no está disponible. Vuelve atrás y elige otro.";

async function postBody(body: Record<string, unknown>): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}/appointment`, { data: body });
}

test("CA-3: la fecha de la cita no importa: una para el mes siguiente y otra para dentro de 300 días suben el contador de este mes", async () => {
  const world = await createListedClinic("cap-ca3");

  await bookSuccessfully(world, daysUntilNextMonth() + PAST_THE_MONTH);
  expect(await readMonthlyBookings(world.accountId)).toBe(1);

  await bookSuccessfully(world, FAR_AWAY_DAYS);
  expect(await readMonthlyBookings(world.accountId)).toBe(2);
  expect(await readMonthlyBookings(world.accountId, nextMonth())).toBe(0);
  const usage = await fetchUsage(world.owner.context, world.clinicId);
  expect(usage.bookedThisMonth).toBe(2);
});

test("CA-4: lo que no crea una cita no cuenta: 400, 404 y 409 por horario dejan el contador y las reservas perdidas como estaban", async () => {
  const world = await createListedClinic("cap-ca4", { booked: 3 });
  const foreign = await createListedClinic("cap-ca4-ajena", {
    specialty: uniqueName("Cardiología"),
  });
  const slot = slotInDays(5);
  const valid = bookingPayload(world, slot);
  const rejections: Array<{
    label: string;
    body: Record<string, unknown>;
    status: number;
  }> = [
    {
      label: "cuerpo inválido",
      body: { ...valid, patientEmail: "no-es-un-correo" },
      status: 400,
    },
    {
      label: "sede inexistente",
      body: { ...valid, clinicId: randomUUID() },
      status: 404,
    },
    {
      label: "médico de otra sede",
      body: bookingPayload(
        { ...world, doctorProfileId: foreign.doctorProfileId },
        slot,
      ),
      status: 404,
    },
    {
      label: "especialidad de otra sede",
      body: bookingPayload(
        { ...world, specialtyName: foreign.specialtyName },
        slot,
      ),
      status: 404,
    },
    {
      label: "horario fuera de la rejilla",
      body: bookingPayload(world, slotInDays(5, "10:15")),
      status: 409,
    },
  ];

  for (const { label, body, status } of rejections) {
    const response = await postBody(body);

    expect(response.status(), label).toBe(status);
    expect(await readMonthlyBookings(world.accountId), label).toBe(3);
    expect(await readMonthlyBookings(foreign.accountId), label).toBe(0);
    expect(await countMissedBookings(world.accountId), label).toBe(0);
  }

  await bookSuccessfully(world, 5);
  expect(await readMonthlyBookings(world.accountId)).toBe(4);

  const taken = await postBookingTo(world, slot);
  expect(taken.status()).toBe(409);
  expect(await taken.json()).toEqual({ message: SLOT_UNAVAILABLE_MESSAGE });
  expect(await readMonthlyBookings(world.accountId)).toBe(4);
  expect(await countMissedBookings(world.accountId)).toBe(0);
});

test("CA-4: con cupo de sobra, dos reservas simultáneas al mismo horario dejan una cita y el contador sube en 1", async () => {
  const world = await createListedClinic("cap-ca4-carrera", { booked: 2 });
  const sharedSlot = limaWallTimeInDays(6, "09:30");

  const responses = await Promise.all([
    postBookingTo(world, sharedSlot, newPortalPatient()),
    postBookingTo(world, sharedSlot, newPortalPatient()),
  ]);

  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  expect(
    await countActiveAppointmentsAt(world.doctorProfileId, sharedSlot),
  ).toBe(1);
  expect(await readMonthlyBookings(world.accountId)).toBe(3);
  expect(await countMissedBookings(world.accountId)).toBe(0);
});

test("CA-5: cancelar desde el link de autogestión no baja el contador (las canceladas cuentan)", async () => {
  const scenario = await createPortalScenario("cap-ca5");
  const { accountId } = scenario.admin;
  await setPlan(accountId, "CONSULTORIO");
  await setMonthlyBookings(accountId, 4);
  const managed = await createManagedAppointment(scenario);
  expect(await readMonthlyBookings(accountId)).toBe(5);
  const portal = await createPortalClient();

  const response = await portal.cancel(managed.token);

  expect(response.status()).toBe(200);
  expect((await readAppointment(managed.appointmentId)).status).toBe(
    "CANCELLED",
  );
  expect(await readMonthlyBookings(accountId)).toBe(5);
});

test("CA-6: reprogramar a un horario del mes siguiente mueve la misma cita y no cambia el contador", async () => {
  const scenario = await createPortalScenario("cap-ca6");
  const { accountId } = scenario.admin;
  await setPlan(accountId, "CONSULTORIO");
  const managed = await createManagedAppointment(scenario);
  const bookedBefore = await readMonthlyBookings(accountId);
  const newWallTime = limaWallTimeInDays(
    daysUntilNextMonth() + PAST_THE_MONTH + 1,
    "11:00",
  );
  const portal = await createPortalClient();

  const response = await portal.reschedule(managed.token, {
    scheduledAt: newWallTime,
    expectedScheduledAt: managed.scheduledAt,
  });

  expect(response.status()).toBe(200);
  const moved = await readAppointment(managed.appointmentId);
  expect(moved.id).toBe(managed.appointmentId);
  expect(moved.rescheduleCount).toBe(1);
  expect(limaWallTime(moved.scheduledAt)).toBe(newWallTime);
  const prisma = await getTestPrisma();
  expect(
    await prisma.appointment.count({ where: { clinicId: scenario.clinicId } }),
  ).toBe(1);
  expect(await readMonthlyBookings(accountId)).toBe(bookedBefore);
});

test("CA-8: una cuenta con 9 contadas sigue con 9 y con el link abierto cuando otra cuenta llega a su tope", async () => {
  const quiet = await createListedClinic("cap-ca8-tranquila", { booked: 9 });
  const busy = await createListedClinic("cap-ca8-llena", { booked: 8 });

  await bookSuccessfully(busy, 2);
  await bookSuccessfully(busy, 3);
  const refused = await postBookingTo(busy, slotInDays(4));

  expect(refused.status()).toBe(409);
  expect(await readMonthlyBookings(busy.accountId)).toBe(10);
  expect(await readMonthlyBookings(quiet.accountId)).toBe(9);
  expect(await countMissedBookings(quiet.accountId)).toBe(0);
  expect(await fetchBookingStatus(quiet.clinicId)).toEqual({
    isAcceptingBookings: true,
    patientContact: null,
  });
  await bookSuccessfully(quiet, 2);
  expect(await readMonthlyBookings(quiet.accountId)).toBe(10);
});
