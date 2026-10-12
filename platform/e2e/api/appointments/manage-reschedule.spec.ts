import { test, expect } from "../../support/test";
import {
  addBookableDoctor,
  appointmentRow,
  bookAppointment,
  bookingDate,
  countChangeNotices,
  createClinicWorkspace,
  createManageClient,
  emailsWithSubject,
  fetchSlots,
  formatWall,
  hoursFromNow,
  instantAtWall,
  limaWall,
  newPatient,
  postBooking,
  readManageLink,
  rescheduleBody,
  seedBookableDoctor,
  slotAfterHours,
  tokenOf,
  updateAppointment,
} from "../../support/self-service";

// docs/features/autogestion-paciente/plan.md: CA-19 a CA-23, CA-30, CA-31 y CA-32 (reprogramar).

const DEADLINE_MESSAGE =
  "Ya no se puede reprogramar porque faltan menos de 12 horas para tu cita. Si no puedes asistir, cancélala y reserva otro horario.";
const LIMIT_MESSAGE =
  "Ya reprogramaste esta cita 3 veces. Si necesitas otro horario, cancélala y reserva de nuevo.";
const SLOT_TAKEN_MESSAGE =
  "Otro paciente acaba de tomar ese horario. Elige otro.";
const MAX_RESCHEDULES = 3;

test("CA-19: reprogramar libera el horario anterior, ocupa el nuevo y el mismo enlace muestra la hora nueva", async () => {
  const seed = await seedBookableDoctor("ca19");
  const booked = await bookAppointment(seed, { time: "10:00" });
  const manage = await createManageClient();

  const response = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "11:30" }),
  );

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "PENDING",
    date: booked.date,
    time: "11:30",
  });
  const slots = await fetchSlots(seed.doctorProfileId, booked.date);
  expect(slots).toContain("10:00");
  expect(slots).not.toContain("11:30");

  const sameLink = await manage.get(booked.token);
  expect(sameLink.status()).toBe(200);
  expect(await sameLink.json()).toMatchObject({ time: "11:30" });
  const row = await appointmentRow(booked.appointmentId);
  expect(row.rescheduleCount).toBe(1);
});

test("CA-20: el horario nuevo puede estar a menos de 12 horas", async () => {
  const seed = await seedBookableDoctor("ca20");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const soon = slotAfterHours(3);

  const response = await manage.reschedule(booked.token, rescheduleBody(soon));

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    date: soon.date,
    time: soon.time,
    rescheduleBlockedBy: "DEADLINE",
  });
});

test("CA-21: a menos de 12 horas reprogramar responde 409 con el mensaje y no mueve la cita; cancelar sigue disponible", async () => {
  const seed = await seedBookableDoctor("ca21");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  await updateAppointment(booked.appointmentId, {
    scheduledAt: hoursFromNow(6),
  });
  const before = await appointmentRow(booked.appointmentId);

  const view = await manage.get(booked.token);
  expect(await view.json()).toMatchObject({
    canCancel: true,
    rescheduleBlockedBy: "DEADLINE",
  });

  const response = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "11:00" }),
  );

  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ message: DEADLINE_MESSAGE });
  const after = await appointmentRow(booked.appointmentId);
  expect(after.scheduledAt).toEqual(before.scheduledAt);
  expect(after.rescheduleCount).toBe(0);

  expect((await manage.cancel(booked.token)).status()).toBe(200);
});

test("CA-21: el plazo se mide en el límite de las 12 horas", async () => {
  const seed = await seedBookableDoctor("ca21b");
  const justInside = await bookAppointment(seed, { time: "09:00" });
  const justOutside = await bookAppointment(seed, { time: "09:30" });
  await updateAppointment(justInside.appointmentId, {
    scheduledAt: new Date(Date.now() + (12 * 60 - 2) * 60 * 1000),
  });
  await updateAppointment(justOutside.appointmentId, {
    scheduledAt: new Date(Date.now() + (12 * 60 + 5) * 60 * 1000),
  });
  const manage = await createManageClient();
  const target = rescheduleBody({ date: bookingDate(20), time: "10:00" });

  expect((await manage.reschedule(justInside.token, target)).status()).toBe(
    409,
  );
  expect(
    (
      await manage.reschedule(
        justOutside.token,
        rescheduleBody({ date: bookingDate(20), time: "10:30" }),
      )
    ).status(),
  ).toBe(200);
});

test("CA-22: tres reprogramaciones funcionan, la cuarta responde 409 y cancelar sigue disponible", async () => {
  const seed = await seedBookableDoctor("ca22");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();

  for (const [index, time] of ["11:00", "11:30", "12:00"].entries()) {
    const response = await manage.reschedule(
      booked.token,
      rescheduleBody({ date: booked.date, time }),
    );
    expect(response.status(), `reprogramación ${index + 1}`).toBe(200);
  }

  const view = await manage.get(booked.token);
  expect(await view.json()).toMatchObject({
    canCancel: true,
    rescheduleBlockedBy: "LIMIT",
  });

  const fourth = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "12:30" }),
  );
  expect(fourth.status()).toBe(409);
  expect(await fourth.json()).toMatchObject({ message: LIMIT_MESSAGE });
  const row = await appointmentRow(booked.appointmentId);
  expect(row.rescheduleCount).toBe(MAX_RESCHEDULES);
  expect(limaWall(row.scheduledAt)).toEqual({
    date: booked.date,
    time: "12:00",
  });

  expect((await manage.cancel(booked.token)).status()).toBe(200);
});

test.describe("CA-23: sólo se mueve a un hueco que el booking ofrece hoy para el médico de la cita", () => {
  async function seedTwoDoctors() {
    const workspace = await createClinicWorkspace("ca23");
    const morningDoctor = await addBookableDoctor(workspace, "ca23-am", {
      startTime: "08:00",
      endTime: "12:00",
    });
    const afternoonDoctor = await addBookableDoctor(workspace, "ca23-pm", {
      startTime: "14:00",
      endTime: "18:00",
    });
    const target = { ...workspace, ...morningDoctor };
    const booked = await bookAppointment(target, { time: "09:00" });
    return { workspace, target, afternoonDoctor, booked };
  }

  test("una hora de otro médico, fuera de disponibilidad, pasada, lejana o ocupada responde 409 sin cambios", async () => {
    const { target, booked } = await seedTwoDoctors();
    const manage = await createManageClient();
    await bookAppointment(target, { time: "10:30", date: booked.date });
    const before = await appointmentRow(booked.appointmentId);

    const attempts: Record<string, { date: string; time: string }> = {
      "hora que sólo ofrece otro médico": { date: booked.date, time: "15:00" },
      "fuera de disponibilidad": { date: booked.date, time: "07:00" },
      pasada: { date: bookingDate(-2), time: "09:00" },
      "más allá del rango": { date: bookingDate(400), time: "09:00" },
      "ocupada por otro paciente": { date: booked.date, time: "10:30" },
    };

    for (const [label, when] of Object.entries(attempts)) {
      const response = await manage.reschedule(
        booked.token,
        rescheduleBody(when),
      );
      expect(response.status(), label).toBe(409);
    }

    const after = await appointmentRow(booked.appointmentId);
    expect(after.scheduledAt).toEqual(before.scheduledAt);
    expect(after.rescheduleCount).toBe(0);
    expect(after.doctorProfileId).toBe(before.doctorProfileId);
  });

  test("un doctorProfileId, clinicId o specialtyId en el cuerpo no cambia médico, sede ni especialidad", async () => {
    const { target, booked, afternoonDoctor, workspace } =
      await seedTwoDoctors();
    const manage = await createManageClient();
    const before = await appointmentRow(booked.appointmentId);

    const response = await manage.reschedule(booked.token, {
      ...rescheduleBody({ date: booked.date, time: "11:00" }),
      doctorProfileId: afternoonDoctor.doctorProfileId,
      clinicId: "00000000-0000-4000-8000-000000000000",
      specialtyId: workspace.specialtyId,
      specialty: "Otra especialidad",
    });

    expect(response.status()).toBe(200);
    const view = await response.json();
    expect(view).toMatchObject({
      doctorProfileId: target.doctorProfileId,
      clinicId: workspace.clinicId,
      specialty: workspace.specialtyName,
      time: "11:00",
    });
    const after = await appointmentRow(booked.appointmentId);
    expect(after.doctorProfileId).toBe(before.doctorProfileId);
    expect(after.clinicId).toBe(before.clinicId);
    expect(after.specialty).toBe(before.specialty);
  });

  test("un scheduledAt mal formado responde 4xx sin cambios", async () => {
    const { booked } = await seedTwoDoctors();
    const manage = await createManageClient();
    const before = await appointmentRow(booked.appointmentId);

    const malformed: unknown[] = [
      {},
      { scheduledAt: "no-es-una-fecha" },
      { scheduledAt: `${booked.date}T10:00:00Z` },
      { scheduledAt: `${booked.date} 10:00` },
      { scheduledAt: "2026-13-45T10:00" },
      { scheduledAt: `${booked.date}T25:00` },
      { scheduledAt: 12345 },
      { scheduledAt: null },
    ];

    for (const body of malformed) {
      const response = await manage.reschedule(booked.token, body);
      expect(response.status(), JSON.stringify(body)).toBeGreaterThanOrEqual(
        400,
      );
      expect(response.status(), JSON.stringify(body)).toBeLessThan(500);
    }

    const after = await appointmentRow(booked.appointmentId);
    expect(after.scheduledAt).toEqual(before.scheduledAt);
    expect(after.rescheduleCount).toBe(0);
  });
});

test("CA-30: al reprogramar, el paciente recibe el correo con la fecha nueva y el mismo enlace sigue funcionando", async () => {
  const seed = await seedBookableDoctor("ca30");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const newDate = bookingDate(20);

  await manage.reschedule(
    booked.token,
    rescheduleBody({ date: newDate, time: "15:30" }),
  );

  const [notice] = emailsWithSubject(
    booked.patient.email,
    `Tu cita en ${seed.clinicName} cambió de horario`,
  );
  expect(notice).toBeDefined();
  expect(notice.html).toContain(formatWall(newDate, "15:30"));
  const linkInNotice = notice.html.match(
    /href="([^"]*\/appointment\/manage\/[^"]+)"/,
  );
  expect(linkInNotice?.[1]).toBe(booked.manageLink);
  expect(tokenOf(readManageLink(booked.patient.email))).toBe(booked.token);

  const stillWorks = await manage.get(booked.token);
  expect(stillWorks.status()).toBe(200);
  expect(await stillWorks.json()).toMatchObject({
    date: newDate,
    time: "15:30",
  });
});

test("CA-31, CA-32: al reprogramar, sólo el médico de la cita recibe el aviso con la fecha anterior y la nueva", async () => {
  const seed = await seedBookableDoctor("ca31r");
  const colleague = await addBookableDoctor(seed, "ca31r-colega");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const newDate = bookingDate(21);

  await manage.reschedule(
    booked.token,
    rescheduleBody({ date: newDate, time: "16:00" }),
  );

  const [notice] = emailsWithSubject(
    seed.doctor.email,
    "Un paciente reprogramó una cita de tu agenda",
  );
  expect(notice).toBeDefined();
  expect(notice.subject).not.toContain(booked.patient.name);
  expect(notice.html).not.toContain(booked.patient.name);
  expect(notice.html).not.toContain(booked.patient.lastName);
  expect(notice.html).toContain(formatWall(booked.date, booked.time));
  expect(notice.html).toContain(formatWall(newDate, "16:00"));
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
});

test("CA-32: una reprogramación rechazada por horario ocupado, plazo o límite no envía correos", async () => {
  const seed = await seedBookableDoctor("ca32r");
  const booked = await bookAppointment(seed, { time: "09:00" });
  await postBooking(seed, newPatient(), { date: booked.date, time: "11:00" });
  const manage = await createManageClient();
  const noticesNow = () =>
    countChangeNotices(booked.patient.email) +
    countChangeNotices(seed.doctor.email);

  const taken = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "11:00" }),
  );
  expect(taken.status()).toBe(409);
  expect(await taken.json()).toMatchObject({ message: SLOT_TAKEN_MESSAGE });
  expect(noticesNow()).toBe(0);

  await updateAppointment(booked.appointmentId, {
    rescheduleCount: MAX_RESCHEDULES,
  });
  const limit = await manage.reschedule(
    booked.token,
    rescheduleBody({ date: booked.date, time: "12:00" }),
  );
  expect(limit.status()).toBe(409);
  expect(noticesNow()).toBe(0);
});

test("la hora nueva se interpreta en hora de Lima", async () => {
  const seed = await seedBookableDoctor("lima");
  const booked = await bookAppointment(seed);
  const manage = await createManageClient();
  const newDate = bookingDate(25);

  await manage.reschedule(
    booked.token,
    rescheduleBody({ date: newDate, time: "08:30" }),
  );

  const row = await appointmentRow(booked.appointmentId);
  expect(row.scheduledAt).toEqual(instantAtWall(newDate, "08:30"));
});
