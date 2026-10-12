import { randomBytes } from "node:crypto";
import { test, expect } from "../../support/test";
import { createApiContext } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import { readEmailsTo } from "../../support/email";
import {
  LINK_UNAVAILABLE_MESSAGE,
  MANAGE_LINK_PATH,
  bookAppointment,
  bookingDate,
  createManageClient,
  hoursFromNow,
  newPatient,
  postBooking,
  readManageLink,
  rescheduleBody,
  seedBookableDoctor,
  tokenOf,
  updateAppointment,
} from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-1, CA-4, CA-5, CA-6, CA-8, CA-10.

const MANAGED_KEYS = [
  "canCancel",
  "clinicAddress",
  "clinicId",
  "clinicName",
  "date",
  "doctorName",
  "doctorProfileId",
  "durationMinutes",
  "patientFirstName",
  "rescheduleBlockedBy",
  "specialty",
  "status",
  "time",
];

test("CA-1: el correo de confirmación trae el botón y el texto de autogestión, sin el párrafo viejo", async () => {
  const seed = await seedBookableDoctor("ca1");
  const booked = await bookAppointment(seed);

  const confirmation = readEmailsTo(booked.patient.email).at(-1);
  expect(confirmation).toBeDefined();
  const html = confirmation?.html ?? "";

  expect(html).toContain("Cancelar o reprogramar");
  expect(html).toContain(
    "Puedes cancelar hasta la hora de tu cita y reprogramar hasta 12 horas antes. No compartas este enlace: da acceso a tu cita.",
  );
  expect(html).not.toMatch(/comun[ií]cate con la cl[ií]nica/i);
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("referencia");
  expect(booked.manageLink).toMatch(
    new RegExp(`${MANAGE_LINK_PATH}[A-Za-z0-9_-]{43}$`),
  );
});

test("CA-4: POST /appointment no devuelve el token ni una URL de autogestión", async () => {
  const seed = await seedBookableDoctor("ca4");
  const patient = newPatient();

  const response = await postBooking(seed, patient, {
    date: bookingDate(),
    time: "10:00",
  });
  expect(response.status()).toBe(200);

  const rawBody = await response.text();
  const token = tokenOf(readManageLink(patient.email));
  expect(rawBody).not.toContain(token);
  expect(rawBody).not.toContain("/appointment/");
  expect(rawBody).not.toMatch(/token/i);
  expect(response.headers().location).toBeUndefined();
});

test("CA-5: el enlace llega sólo al correo de la ficha, no al que se escribió al reservar", async () => {
  const seed = await seedBookableDoctor("ca5");
  const patient = newPatient();
  const first = await bookAppointment(seed, { patient, time: "09:00" });
  const originalEmail = patient.email;
  const typedEmail = newPatient().email;

  const manage = await createManageClient();
  const response = await postBooking(
    seed,
    { ...patient, email: typedEmail },
    { date: first.date, time: "11:00" },
  );
  expect(response.status()).toBe(200);

  const linksToOriginal = readEmailsTo(originalEmail).filter((captured) =>
    captured.html.includes(MANAGE_LINK_PATH),
  );
  expect(linksToOriginal).toHaveLength(2);
  expect(readEmailsTo(typedEmail)).toHaveLength(0);

  const secondLink = readManageLink(originalEmail);
  const view = await manage.get(tokenOf(secondLink));
  expect(view.status()).toBe(200);
  expect(await view.json()).toMatchObject({ time: "11:00" });
});

test("CA-6, CA-8: la vista, cancelar y reprogramar devuelven sólo los campos permitidos y no se cachean", async () => {
  const seed = await seedBookableDoctor("ca6");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const forbiddenValues = [
    booked.patient.lastName,
    booked.patient.documentNumber,
    booked.patient.phone,
    booked.patient.email,
    booked.patient.birthDate,
    booked.appointmentId,
  ];
  const prisma = await getTestPrisma();
  const patientRow = await prisma.patient.findFirst({
    where: { email: booked.patient.email },
  });
  if (patientRow) forbiddenValues.push(patientRow.id);

  async function expectSafeBody(
    response: Awaited<ReturnType<typeof manage.get>>,
  ) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const rawBody = await response.text();
    expect(Object.keys(JSON.parse(rawBody)).sort()).toEqual(MANAGED_KEYS);
    for (const forbidden of forbiddenValues) {
      expect(rawBody).not.toContain(forbidden);
    }
    expect(JSON.parse(rawBody)).toMatchObject({
      patientFirstName: booked.patient.name,
    });
  }

  await expectSafeBody(await manage.get(booked.token));
  await expectSafeBody(
    await manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time: "11:00" }),
    ),
  );
  await expectSafeBody(await manage.cancel(booked.token));
});

test("CA-8: las respuestas de error también llevan Cache-Control no-store", async () => {
  const manage = await createManageClient();
  const unknown = randomBytes(32).toString("base64url");

  for (const response of [
    await manage.get(unknown),
    await manage.cancel(unknown),
    await manage.reschedule(
      unknown,
      rescheduleBody({ date: "2030-01-01", time: "10:00" }),
    ),
  ]) {
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

test("CA-10: todo enlace no disponible responde el mismo 404 en GET, cancelar y reprogramar", async () => {
  const seed = await seedBookableDoctor("ca10");
  const live = await bookAppointment(seed, { time: "09:00" });
  const started = await bookAppointment(seed, { time: "09:30" });
  await updateAppointment(started.appointmentId, {
    scheduledAt: hoursFromNow(-1),
  });
  const cancelledAndPast = await bookAppointment(seed, { time: "10:30" });
  await updateAppointment(cancelledAndPast.appointmentId, {
    status: "CANCELLED",
    cancelledAt: hoursFromNow(-3),
    scheduledAt: hoursFromNow(-1),
  });

  const lastChar = live.token.at(-1) === "A" ? "B" : "A";
  const tokens: Record<string, string> = {
    inexistente: randomBytes(32).toString("base64url"),
    "un carácter cambiado": `${live.token.slice(0, -1)}${lastChar}`,
    corto: "abc",
    "largo (44 caracteres)": "a".repeat(44),
    "largo (100 caracteres)": "a".repeat(100),
    "caracteres no válidos": "$$$$$$$$$$$$$$$$$$$$",
    "cita ya empezada": started.token,
    "cancelada y ya pasada": cancelledAndPast.token,
  };

  const manage = await createManageClient();
  const body = rescheduleBody({ date: bookingDate(30), time: "10:00" });
  const seenBodies = new Set<string>();

  for (const [label, token] of Object.entries(tokens)) {
    const responses = {
      GET: await manage.get(token),
      cancel: await manage.cancel(token),
      reschedule: await manage.reschedule(token, body),
    };
    for (const [action, response] of Object.entries(responses)) {
      expect.soft(response.status(), `${label} (${action})`).toBe(404);
      seenBodies.add(await response.text());
    }
  }

  expect([...seenBodies]).toEqual([
    JSON.stringify({ message: LINK_UNAVAILABLE_MESSAGE }),
  ]);
});

test("CA-10: la cita cancelada que aún no empieza sigue abriéndose; la que ya empezó no", async () => {
  const seed = await seedBookableDoctor("ca10b");
  const booked = await bookAppointment(seed);
  const api = await createApiContext();
  const manage = await createManageClient();

  expect((await manage.cancel(booked.token)).status()).toBe(200);
  const stillOpen = await manage.get(booked.token);
  expect(stillOpen.status()).toBe(200);
  expect(await stillOpen.json()).toMatchObject({
    status: "CANCELLED",
    canCancel: false,
    rescheduleBlockedBy: null,
  });

  await updateAppointment(booked.appointmentId, {
    scheduledAt: hoursFromNow(-1),
  });
  const now = await api.get(
    `${API_BASE_URL}${MANAGE_LINK_PATH}${booked.token}`,
  );
  expect(now.status()).toBe(404);
});

test("CA-10: un token de más de 100 caracteres responde el mismo 404 que cualquier otro enlace no disponible", async () => {
  const manage = await createManageClient();
  const body = rescheduleBody({ date: bookingDate(30), time: "10:00" });

  for (const length of [101, 300]) {
    const token = "a".repeat(length);
    const responses = {
      GET: await manage.get(token),
      cancel: await manage.cancel(token),
      reschedule: await manage.reschedule(token, body),
    };
    for (const [action, response] of Object.entries(responses)) {
      expect
        .soft(response.status(), `${length} caracteres (${action})`)
        .toBe(404);
      expect
        .soft(await response.text(), `${length} caracteres (${action})`)
        .toBe(JSON.stringify({ message: LINK_UNAVAILABLE_MESSAGE }));
    }
  }
});
