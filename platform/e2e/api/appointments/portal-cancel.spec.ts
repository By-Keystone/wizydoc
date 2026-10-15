import { test, expect } from "../../support/test";
import { readEmailsTo } from "../../support/email";
import {
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTime,
  limaWallTimeInDays,
  limaWallTimeInHours,
  moveAppointmentTo,
  newPortalPatient,
  postBooking,
  readAppointment,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — CA-11, CA-19 a CA-22, CA-32 y CA-50 (parte API).

const HOURS_BEFORE_DEADLINE = 6;
const HOURS_AFTER_DEADLINE = 13;
const LESS_THAN_NOTICE_MESSAGE =
  "Ya no puedes cambiar esta cita desde este enlace porque faltan menos de 12 horas.";

test.describe("POST /appointment/manage/:token/cancel", () => {
  test("CA-19: con días de antelación cancela, responde la cita cancelada y no expone datos del paciente (CA-11)", async () => {
    const scenario = await createPortalScenario("cancel-days");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const response = await client.cancel(managed.token);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("CANCELLED");
    expect(body.canCancel).toBe(false);
    const rawBody = JSON.stringify(body);
    for (const forbidden of [
      managed.patient.lastName,
      managed.patient.documentNumber,
      managed.patient.phone,
      managed.patient.email,
      managed.patient.birthDate,
      managed.appointmentId,
      managed.patientId,
    ]) {
      expect(rawBody).not.toContain(forbidden);
    }
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.status).toBe("CANCELLED");
    expect(stored.cancelledAt).not.toBeNull();
  });

  test("CA-19: con horas de antelación (13 h) también cancela", async () => {
    const scenario = await createPortalScenario("cancel-hours");
    const managed = await createManagedAppointment(scenario);
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_AFTER_DEADLINE),
    );
    const client = await createPortalClient();

    const response = await client.cancel(managed.token);

    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe("CANCELLED");
  });

  test("CA-19: a menos de 12 h no se puede cancelar ni reprogramar, la página lo indica y no cambia nada ni manda correos", async () => {
    const scenario = await createPortalScenario("cancel-late");
    const managed = await createManagedAppointment(scenario);
    const lateWallTime = limaWallTimeInHours(HOURS_BEFORE_DEADLINE);
    await moveAppointmentTo(managed.appointmentId, lateWallTime);
    const client = await createPortalClient();
    const emailsBefore = readEmailsTo(managed.patient.email).length;

    const portal = await (await client.get(managed.token)).json();
    const cancel = await client.cancel(managed.token);
    const reschedule = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(12, "11:00"),
    });

    expect(portal.canCancel).toBe(false);
    expect(portal.rescheduleBlockedBy).toBe("DEADLINE");
    expect(cancel.status()).toBe(409);
    expect(await cancel.json()).toEqual({
      message: LESS_THAN_NOTICE_MESSAGE,
      code: "CANCEL_NOT_ALLOWED",
    });
    expect(reschedule.status()).toBe(409);
    expect((await reschedule.json()).code).toBe("RESCHEDULE_NOT_ALLOWED");
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.status).toBe("PENDING");
    expect(stored.rescheduleCount).toBe(0);
    expect(limaWallTime(stored.scheduledAt)).toBe(lateWallTime);
    expect(readEmailsTo(managed.patient.email)).toHaveLength(emailsBefore);
  });

  test("CA-19: ninguna respuesta ni el cuerpo del error menciona cancelación tardía", async () => {
    const scenario = await createPortalScenario("cancel-late-wording");
    const managed = await createManagedAppointment(scenario);
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    );
    const client = await createPortalClient();

    const responses = [
      await client.get(managed.token),
      await client.cancel(managed.token),
    ];

    for (const response of responses) {
      expect((await response.text()).toLowerCase()).not.toContain("tardía");
    }
  });

  test("CA-50: si el plazo se cumple con la página abierta, cancelar con la hora esperada no se aplica", async () => {
    const scenario = await createPortalScenario("cancel-deadline-passes");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const pageIsOpen = await (await client.get(managed.token)).json();
    expect(pageIsOpen.canCancel).toBe(true);
    const lateWallTime = limaWallTimeInHours(HOURS_BEFORE_DEADLINE);
    await moveAppointmentTo(managed.appointmentId, lateWallTime);

    const response = await client.cancel(managed.token, {
      expectedScheduledAt: lateWallTime,
    });

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("CANCEL_NOT_ALLOWED");
    expect((await readAppointment(managed.appointmentId)).status).toBe(
      "PENDING",
    );
  });

  test("CA-21: cancelar dos veces seguidas responde 200 las dos y deja una sola cancelación", async () => {
    const scenario = await createPortalScenario("cancel-twice");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const first = await client.cancel(managed.token);
    const cancelledAt = (await readAppointment(managed.appointmentId))
      .cancelledAt;
    const second = await client.cancel(managed.token);

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await second.json()).status).toBe("CANCELLED");
    expect((await readAppointment(managed.appointmentId)).cancelledAt).toEqual(
      cancelledAt,
    );
  });

  test("CA-21: dos cancelaciones simultáneas responden 200 las dos y la cita queda cancelada una vez", async () => {
    const scenario = await createPortalScenario("cancel-simultaneous");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const expectedScheduledAt = managed.scheduledAt;

    const responses = await Promise.all([
      client.cancel(managed.token, { expectedScheduledAt }),
      client.cancel(managed.token, { expectedScheduledAt }),
    ]);

    expect(responses.map((response) => response.status())).toEqual([200, 200]);
    expect((await readAppointment(managed.appointmentId)).status).toBe(
      "CANCELLED",
    );
  });

  test("CA-20: reprogramar una cita cancelada se rechaza como cita cambiada y no la reactiva", async () => {
    const scenario = await createPortalScenario("cancel-then-reschedule");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await client.cancel(managed.token);

    const response = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(12, "11:00"),
    });

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("APPOINTMENT_CHANGED");
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.status).toBe("CANCELLED");
    expect(stored.rescheduleCount).toBe(0);
  });

  test("CA-22: tras cancelar el horario queda libre y otro paciente lo reserva", async () => {
    const scenario = await createPortalScenario("cancel-frees-slot");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const stillTaken = await postBooking(
      scenario,
      managed.doctorProfileId,
      managed.scheduledAt,
    );
    await client.cancel(managed.token);

    const response = await postBooking(
      scenario,
      managed.doctorProfileId,
      managed.scheduledAt,
      newPortalPatient(),
    );

    expect(stillTaken.status()).toBe(409);
    expect(response.status()).toBe(200);
  });

  test("CA-32: cancelar desde una pantalla vieja (la cita se reprogramó) responde APPOINTMENT_CHANGED y no la cancela", async () => {
    const scenario = await createPortalScenario("cancel-stale");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const newWallTime = limaWallTimeInDays(11, "11:00");
    const reschedule = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
    });
    expect(reschedule.status()).toBe(200);

    const response = await client.cancel(managed.token, {
      expectedScheduledAt: managed.scheduledAt,
    });

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("APPOINTMENT_CHANGED");
    expect((await readAppointment(managed.appointmentId)).status).toBe(
      "PENDING",
    );
  });

  test("CA-32: cancelar una cita ya cancelada con una hora vieja responde 200 (idempotente)", async () => {
    const scenario = await createPortalScenario("cancel-stale-cancelled");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await client.cancel(managed.token);

    const response = await client.cancel(managed.token, {
      expectedScheduledAt: limaWallTimeInDays(3, "09:00"),
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe("CANCELLED");
  });

  test("cancelar con la hora esperada correcta funciona y con un cuerpo mal formado responde 400 sin cambios", async () => {
    const scenario = await createPortalScenario("cancel-body");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const malformed = await client.cancel(managed.token, {
      expectedScheduledAt: "mañana",
    });
    const matching = await client.cancel(managed.token, {
      expectedScheduledAt: managed.scheduledAt,
    });

    expect(malformed.status()).toBe(400);
    expect(matching.status()).toBe(200);
  });
});
