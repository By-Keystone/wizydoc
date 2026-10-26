import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { newPortalPatient } from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import {
  BOOKING_CLOSED_BODY,
  bookingPayload,
  bookSuccessfully,
  countMissedBookings,
  createListedClinic,
  emailsWithSubject,
  getAnonymously,
  postAnonymously,
  postBookingTo,
  readMonthlyBookings,
  REACHED_NOTICE_SUBJECT,
  setMonthlyBookings,
  slotInDays,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/tope-citas-mes/plan.md: CA-24, CA-25 y CA-71.

const BOOKING_OPTION_UNAVAILABLE =
  "Ese médico o especialidad ya no está disponible en esta sede. Recarga la página y vuelve a elegirlos.";
const SLOT_UNAVAILABLE =
  "Ese horario ya no está disponible. Vuelve atrás y elige otro.";
const PAYMENT_REQUIRED = 402;

async function postBody(body: Record<string, unknown>): Promise<APIResponse> {
  const anonymous = await createApiContext();
  return anonymous.post(`${API_BASE_URL}/appointment`, { data: body });
}

test("CA-24: con el tope alcanzado, POST /appointment responde 409 con el cuerpo exacto y no crea cita, ficha ni correo", async () => {
  const world = await createListedClinic("cap-ca24", { booked: 10 });
  const patient = newPortalPatient();

  const response = await postBookingTo(world, slotInDays(2), patient);

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual(BOOKING_CLOSED_BODY);
  const prisma = await getTestPrisma();
  expect(
    await prisma.appointment.count({ where: { clinicId: world.clinicId } }),
  ).toBe(0);
  expect(
    await prisma.patient.count({ where: { accountId: world.accountId } }),
  ).toBe(0);
  expect(readEmailsTo(patient.email)).toHaveLength(0);
  expect(
    emailsWithSubject(world.owner.email, REACHED_NOTICE_SUBJECT),
  ).toHaveLength(0);
  expect(await readMonthlyBookings(world.accountId)).toBe(10);
});

test("CA-24: ninguna petición del booking responde 402 con el tope alcanzado", async () => {
  const world = await createListedClinic("cap-ca24-402", { booked: 10 });
  const responses = [
    await getAnonymously(`/clinic/${world.clinicId}/doctors`),
    await getAnonymously(`/clinic/${world.clinicId}/location`),
    await getAnonymously(`/clinic/${world.clinicId}/booking-status`),
    await postAnonymously(`/clinic/${world.clinicId}/missed-bookings`),
    await postBookingTo(world, slotInDays(2)),
  ];

  for (const response of responses) {
    expect(response.status(), response.url()).not.toBe(PAYMENT_REQUIRED);
  }
  expect(responses.map((response) => response.status())).toEqual([
    200, 200, 200, 204, 409,
  ]);
});

test("CA-25: el tope gana al horario tomado, y el 404 de una combinación ajena no suma reservas perdidas", async () => {
  const world = await createListedClinic("cap-ca25");
  const foreign = await createListedClinic("cap-ca25-ajena", {
    specialty: uniqueName("Cardiología"),
  });
  await bookSuccessfully(world, 2);
  await setMonthlyBookings(world.accountId, 10);
  const slot = slotInDays(2);
  const valid = bookingPayload(world, slot);

  const notFound = [
    { ...valid, clinicId: randomUUID() },
    bookingPayload(
      { ...world, doctorProfileId: foreign.doctorProfileId },
      slot,
    ),
    bookingPayload({ ...world, specialtyName: foreign.specialtyName }, slot),
  ];
  for (const body of notFound) {
    const response = await postBody(body);

    expect(response.status()).toBe(404);
  }
  expect(await countMissedBookings(world.accountId)).toBe(0);

  const taken = await postBookingTo(world, slot);

  expect(taken.status()).toBe(409);
  expect(await taken.json()).toEqual(BOOKING_CLOSED_BODY);
  expect(await countMissedBookings(world.accountId)).toBe(1);
  expect(await countMissedBookings(foreign.accountId)).toBe(0);
});

test("CA-71: los 400, 404 y 409 de horario conservan su cuerpo; solo el tope lleva el code BOOKING_CLOSED", async () => {
  const world = await createListedClinic("cap-ca71", { booked: 3 });
  const valid = bookingPayload(world, slotInDays(2));

  const invalid = await postBody({ ...valid, patientEmail: "no-es-un-correo" });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).code).not.toBe("BOOKING_CLOSED");

  const unknownClinic = await postBody({ ...valid, clinicId: randomUUID() });
  expect(unknownClinic.status()).toBe(404);
  expect(await unknownClinic.json()).toEqual({
    message: BOOKING_OPTION_UNAVAILABLE,
  });

  const offGrid = await postBody(bookingPayload(world, slotInDays(2, "10:15")));
  expect(offGrid.status()).toBe(409);
  expect(await offGrid.json()).toEqual({ message: SLOT_UNAVAILABLE });
});

test("CA-71: la sede de una cuenta con el médico de otra responde 404 y no mueve el contador ni suma reservas perdidas en ninguna", async () => {
  const capped = await createListedClinic("cap-ca71-llena", { booked: 10 });
  const open = await createListedClinic("cap-ca71-abierta", { booked: 3 });
  const slot = slotInDays(2);
  const crossed = [
    bookingPayload({ ...capped, doctorProfileId: open.doctorProfileId }, slot),
    bookingPayload(
      {
        ...open,
        doctorProfileId: capped.doctorProfileId,
        specialtyName: capped.specialtyName,
      },
      slot,
    ),
  ];

  for (const body of crossed) {
    const response = await postBody(body);

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({
      message: BOOKING_OPTION_UNAVAILABLE,
    });
  }

  expect(await readMonthlyBookings(capped.accountId)).toBe(10);
  expect(await readMonthlyBookings(open.accountId)).toBe(3);
  expect(await countMissedBookings(capped.accountId)).toBe(0);
  expect(await countMissedBookings(open.accountId)).toBe(0);
});
