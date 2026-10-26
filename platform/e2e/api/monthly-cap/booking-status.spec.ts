import { randomUUID } from "node:crypto";
import {
  addListedClinic,
  createListedClinic,
  getAnonymously,
  LIMA_LANDLINE_CONTACT,
  MOBILE_CONTACT,
  setMonthlyBookings,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-68 y la parte api de CA-54.

const STATUS_PATH = (clinicId: string) => `/clinic/${clinicId}/booking-status`;
const NO_STORE = "private, no-store";

test("CA-68: con el link abierto responde exactamente { isAcceptingBookings: true, patientContact: null }, aunque la sede tenga contacto", async () => {
  const world = await createListedClinic("status-abierto", {
    patientContact: MOBILE_CONTACT,
  });

  const response = await getAnonymously(STATUS_PATH(world.clinicId));

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    isAcceptingBookings: true,
    patientContact: null,
  });
  expect(response.headers()["cache-control"]).toBe(NO_STORE);
});

test("CA-68 y CA-54: con el link cerrado devuelve el contacto de cada sede, o null, con exactamente dos claves", async () => {
  const world = await createListedClinic("status-cerrado", {
    booked: 10,
    patientContact: MOBILE_CONTACT,
  });
  const second = await addListedClinic(world, {
    patientContact: LIMA_LANDLINE_CONTACT,
  });
  const third = await addListedClinic(world);

  const bodies = await Promise.all(
    [world.clinicId, second.clinicId, third.clinicId].map(async (clinicId) => {
      const response = await getAnonymously(STATUS_PATH(clinicId));
      expect(response.status()).toBe(200);
      return response.json();
    }),
  );

  expect(bodies).toEqual([
    { isAcceptingBookings: false, patientContact: MOBILE_CONTACT },
    { isAcceptingBookings: false, patientContact: LIMA_LANDLINE_CONTACT },
    { isAcceptingBookings: false, patientContact: null },
  ]);
  for (const body of bodies) {
    expect(Object.keys(body).sort()).toEqual([
      "isAcceptingBookings",
      "patientContact",
    ]);
  }
});

test("CA-68: reabrir el link (otro plan o el mes nuevo) vuelve a ocultar el contacto", async () => {
  const world = await createListedClinic("status-reabre", {
    booked: 10,
    patientContact: MOBILE_CONTACT,
  });
  const closed = await getAnonymously(STATUS_PATH(world.clinicId));
  expect(await closed.json()).toEqual({
    isAcceptingBookings: false,
    patientContact: MOBILE_CONTACT,
  });

  await setMonthlyBookings(world.accountId, 9);

  const reopened = await getAnonymously(STATUS_PATH(world.clinicId));
  expect(await reopened.json()).toEqual({
    isAcceptingBookings: true,
    patientContact: null,
  });
});

test("CA-68: el id de una organización o un UUID que no existe dan 404 «Sede no encontrada», y un id que no es UUID da 400", async () => {
  const world = await createListedClinic("status-ids");

  for (const unknownId of [world.organizationId, randomUUID()]) {
    const response = await getAnonymously(STATUS_PATH(unknownId));

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ message: "Sede no encontrada" });
    expect(response.headers()["cache-control"]).toBe(NO_STORE);
  }

  const notUuid = await getAnonymously(STATUS_PATH("no-es-un-uuid"));
  expect(notUuid.status()).toBe(400);
});
