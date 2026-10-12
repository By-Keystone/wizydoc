import { test, expect } from "../../support/test";
import {
  addBookableDoctor,
  appointmentRow,
  bookAppointment,
  bookingDate,
  countChangeNotices,
  createManageClient,
  emailsWithSubject,
  fetchSlots,
  formatWall,
  hoursFromNow,
  newPatient,
  postBooking,
  rescheduleBody,
  seedBookableDoctor,
  updateAppointment,
} from "../../support/self-service";
import { readEmailsTo } from "../../support/email";

// docs/features/autogestion-paciente/plan.md: CA-13, CA-15, CA-16, CA-17, CA-29, CA-31, CA-32 (cancelar).

const MINUTES_BEFORE_START = 3;
const LATE_CANCELLATION_PATTERN = /tard[ií]a|tarde/i;

test("CA-13: cancelar a días de la cita y a minutos de ella da la misma respuesta y los mismos correos, sin etiqueta tardía", async () => {
  const seed = await seedBookableDoctor("ca13");
  const early = await bookAppointment(seed, { time: "09:00" });
  const late = await bookAppointment(seed, { time: "09:30" });
  await updateAppointment(late.appointmentId, {
    scheduledAt: hoursFromNow(MINUTES_BEFORE_START / 60),
  });
  const manage = await createManageClient();

  const earlyResponse = await manage.cancel(early.token);
  const lateResponse = await manage.cancel(late.token);

  expect(earlyResponse.status()).toBe(200);
  expect(lateResponse.status()).toBe(200);
  const earlyBody = await earlyResponse.json();
  const lateBody = await lateResponse.json();
  expect(earlyBody).toMatchObject({
    status: "CANCELLED",
    canCancel: false,
    rescheduleBlockedBy: null,
  });
  expect(lateBody).toMatchObject({
    status: "CANCELLED",
    canCancel: false,
    rescheduleBlockedBy: null,
  });
  expect(Object.keys(lateBody).sort()).toEqual(Object.keys(earlyBody).sort());

  for (const booked of [early, late]) {
    expect(
      emailsWithSubject(booked.patient.email, /fue cancelada/),
    ).toHaveLength(1);
  }
  expect(emailsWithSubject(seed.doctor.email, /cancel/i)).toHaveLength(2);
  const allNotices = [
    ...emailsWithSubject(late.patient.email, /cancel/i),
    ...emailsWithSubject(seed.doctor.email, /cancel/i),
  ];
  for (const notice of allNotices) {
    expect(notice.subject).not.toMatch(LATE_CANCELLATION_PATTERN);
    expect(notice.html).not.toMatch(LATE_CANCELLATION_PATTERN);
  }

  const lateRow = await appointmentRow(late.appointmentId);
  expect(lateRow.status).toBe("CANCELLED");
  expect(lateRow.cancelledAt).not.toBeNull();
});

test("CA-15: cancelar dos veces responde 200 las dos y sólo la primera envía correos", async () => {
  const seed = await seedBookableDoctor("ca15");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  const first = await manage.cancel(booked.token);
  const second = await manage.cancel(booked.token);

  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  expect(await second.json()).toMatchObject({ status: "CANCELLED" });
  expect(emailsWithSubject(booked.patient.email, /fue cancelada/)).toHaveLength(
    1,
  );
  expect(emailsWithSubject(seed.doctor.email, /cancel/i)).toHaveLength(1);
});

test("CA-15: dos cancelaciones simultáneas (doble toque) envían un solo juego de correos", async () => {
  const seed = await seedBookableDoctor("ca15b");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  const responses = await Promise.all([
    manage.cancel(booked.token),
    manage.cancel(booked.token),
  ]);

  expect(responses.map((response) => response.status())).toEqual([200, 200]);
  expect(emailsWithSubject(booked.patient.email, /fue cancelada/)).toHaveLength(
    1,
  );
  expect(emailsWithSubject(seed.doctor.email, /cancel/i)).toHaveLength(1);
});

test("CA-16: tras cancelar, el horario vuelve a ofrecerse y otro paciente lo reserva", async () => {
  const seed = await seedBookableDoctor("ca16");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  expect(await fetchSlots(seed.doctorProfileId, booked.date)).not.toContain(
    booked.time,
  );

  expect((await manage.cancel(booked.token)).status()).toBe(200);

  expect(await fetchSlots(seed.doctorProfileId, booked.date)).toContain(
    booked.time,
  );
  const otherPatient = await postBooking(seed, newPatient(), {
    date: booked.date,
    time: booked.time,
  });
  expect(otherPatient.status()).toBe(200);
});

test("CA-17: reprogramar una cita cancelada responde 409 y no la cambia", async () => {
  const seed = await seedBookableDoctor("ca17");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  await manage.cancel(booked.token);
  const before = await appointmentRow(booked.appointmentId);

  const response = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "11:00" }),
  );

  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({
    message: "Esta cita está cancelada. Puedes reservar una nueva.",
  });
  const after = await appointmentRow(booked.appointmentId);
  expect(after.status).toBe("CANCELLED");
  expect(after.scheduledAt).toEqual(before.scheduledAt);
  expect(after.rescheduleCount).toBe(0);
});

test("CA-29: al cancelar, el paciente recibe el correo con los datos de la cita", async () => {
  const seed = await seedBookableDoctor("ca29");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  await manage.cancel(booked.token);

  const [notice] = emailsWithSubject(
    booked.patient.email,
    `Tu cita en ${seed.clinicName} fue cancelada`,
  );
  expect(notice).toBeDefined();
  expect(notice.to).toBe(booked.patient.email);
  expect(notice.html).toContain(formatWall(booked.date, booked.time));
  expect(notice.html).toContain(seed.specialtyName);
  expect(notice.html).toContain(seed.doctorFullName);
  expect(notice.html).toContain(seed.clinicName);
  expect(notice.html).toContain(seed.clinicAddress);
  expect(notice.html).toContain(`/clinic/${seed.clinicId}/create-appointment`);
});

test("CA-31, CA-32: al cancelar, sólo el médico de la cita recibe el aviso, con los datos permitidos", async () => {
  const seed = await seedBookableDoctor("ca31");
  const colleague = await addBookableDoctor(seed, "ca31-colega");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  await manage.cancel(booked.token);

  const [notice] = emailsWithSubject(
    seed.doctor.email,
    "Un paciente canceló una cita de tu agenda",
  );
  expect(notice).toBeDefined();
  expect(notice.subject).not.toContain(booked.patient.name);
  expect(notice.html).not.toContain(booked.patient.name);
  expect(notice.html).not.toContain(booked.patient.lastName);
  expect(notice.html).toContain(formatWall(booked.date, booked.time));
  expect(notice.html).toContain(seed.specialtyName);
  expect(notice.html).toContain(seed.clinicName);
  for (const forbidden of [
    booked.patient.documentNumber,
    booked.patient.phone,
    booked.patient.email,
    booked.token,
    "/appointment/manage",
  ]) {
    expect(notice.html).not.toContain(forbidden);
  }

  expect(countChangeNotices(seed.admin.email)).toBe(0);
  expect(countChangeNotices(colleague.doctor.email)).toBe(0);
  expect(
    readEmailsTo(seed.admin.email).filter((captured) =>
      captured.html.includes(booked.patient.lastName),
    ),
  ).toHaveLength(0);
});

test("CA-32: una petición rechazada no envía ningún correo", async () => {
  const seed = await seedBookableDoctor("ca32");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const emailsBefore = () =>
    countChangeNotices(booked.patient.email) +
    countChangeNotices(seed.doctor.email);

  const unknownToken = `${booked.token.slice(0, -1)}${booked.token.at(-1) === "A" ? "B" : "A"}`;
  const rejected = [
    await manage.cancel(unknownToken),
    await manage.reschedule(
      unknownToken,
      rescheduleBody({ date: booked.date, time: "11:00" }),
    ),
    await manage.reschedule(booked.token, { scheduledAt: "no-es-una-fecha" }),
    await manage.reschedule(
      booked.token,
      rescheduleBody({ date: bookingDate(-3), time: "11:00" }),
    ),
  ];
  const statuses = rejected.map((response) => response.status());

  expect(statuses[0]).toBe(404);
  expect(statuses[1]).toBe(404);
  expect(statuses[2]).toBeGreaterThanOrEqual(400);
  expect(statuses[2]).toBeLessThan(500);
  expect(statuses[3]).toBe(409);
  expect(emailsBefore()).toBe(0);

  await updateAppointment(booked.appointmentId, {
    scheduledAt: hoursFromNow(6),
  });
  const deadline = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "11:00" }),
  );
  expect(deadline.status()).toBe(409);
  expect(emailsBefore()).toBe(0);
});
