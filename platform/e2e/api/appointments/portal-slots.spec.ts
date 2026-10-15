import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import { createApiContext } from "../../support/accounts";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  LINK_UNAVAILABLE_MESSAGE,
  limaWallTimeInDays,
  limaWallTimeInHours,
  moveAppointmentTo,
  removeAvailability,
  NO_STORE_CACHE_CONTROL,
  updateAppointment,
  wallTimeToInstant,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — d-19: al reprogramar sólo se ofrecen horarios a 12 h o más, del mismo médico.

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const NEW_SLOT_LEAD_HOURS = 12;
const HOURS_BEFORE_DEADLINE = 6;
const HOURS_AFTER_DEADLINE = 40;
const DAYS_BEYOND_BOOKING_RANGE = 400;
const MORNING_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];
const UNAVAILABLE_BODY = {
  message: LINK_UNAVAILABLE_MESSAGE,
  code: "NOT_FOUND",
};

function limaDate(days: number): string {
  return limaWallTimeInDays(days, "00:00").slice(0, 10);
}

function rangeQuery(fromDays: number, toDays: number): string {
  return `?from=${limaDate(fromDays)}&to=${limaDate(toDays)}`;
}

test.describe("GET /appointment/manage/:token/slots - horarios para reprogramar", () => {
  test("devuelve los horarios del médico de la cita con la forma del booking", async () => {
    const scenario = await createPortalScenario("slots-shape");
    const morningDoctor = await addPortalDoctor({
      label: "slots-shape-morning",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
      availability: "mornings",
    });
    const managed = await createManagedAppointment(scenario, {
      doctorProfileId: morningDoctor.doctorProfileId,
      scheduledAt: limaWallTimeInDays(10, "09:00"),
    });
    const client = await createPortalClient();

    const response = await client.slots(managed.token, rangeQuery(3, 5));

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["days", "durationMinutes"]);
    expect(body.durationMinutes).toBe(30);
    expect(Object.keys(body.days)).toEqual([
      limaDate(3),
      limaDate(4),
      limaDate(5),
    ]);
    for (const times of Object.values(body.days)) {
      expect(times).toEqual(MORNING_SLOTS);
    }

    const booking = await (
      await (
        await createApiContext()
      ).get(
        `${API_BASE_URL}/doctor-profile/${morningDoctor.doctorProfileId}/slots${rangeQuery(3, 5)}`,
      )
    ).json();
    expect(body).toEqual(booking);
  });

  test("no incluye horarios a menos de 12 h y conserva el resto del día", async () => {
    const scenario = await createPortalScenario("slots-lead");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const now = Date.now();

    const response = await client.slots(managed.token, rangeQuery(0, 2));

    expect(response.status()).toBe(200);
    const { days } = await response.json();
    const offered = Object.entries(days as Record<string, string[]>).flatMap(
      ([date, times]) => times.map((time) => `${date}T${time}`),
    );
    expect(offered.length).toBeGreaterThan(0);
    for (const wallTime of offered) {
      const hoursAway =
        (wallTimeToInstant(wallTime).getTime() - now) / MILLISECONDS_PER_HOUR;
      expect(hoursAway).toBeGreaterThanOrEqual(NEW_SLOT_LEAD_HOURS);
    }
    expect(offered).toContain(limaWallTimeInHours(NEW_SLOT_LEAD_HOURS + 1));
    expect(offered).not.toContain(limaWallTimeInHours(NEW_SLOT_LEAD_HOURS - 1));
  });

  test("token inválido, desconocido o de cita empezada dan el mismo 404 sin caché", async () => {
    const scenario = await createPortalScenario("slots-404");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await updateAppointment(managed.appointmentId, {
      scheduledAt: new Date(Date.now() - 2 * MILLISECONDS_PER_HOUR),
    });

    const responses = [
      await client.slots("a".repeat(64), rangeQuery(3, 4)),
      await client.slots("token-invalido", rangeQuery(3, 4)),
      await client.slots(managed.token, rangeQuery(3, 4)),
      await client.slots(managed.token, "?from=no-es-fecha"),
    ];

    for (const response of responses) {
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("una cita ya reprogramada da 409 RESCHEDULE_NOT_ALLOWED", async () => {
    const scenario = await createPortalScenario("slots-limit");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await updateAppointment(managed.appointmentId, { rescheduleCount: 1 });

    const response = await client.slots(managed.token, rangeQuery(3, 4));

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("RESCHEDULE_NOT_ALLOWED");
    expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
  });

  test("una cita a menos de 12 h da 409 RESCHEDULE_NOT_ALLOWED", async () => {
    const scenario = await createPortalScenario("slots-deadline");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    );

    const response = await client.slots(managed.token, rangeQuery(3, 4));

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("RESCHEDULE_NOT_ALLOWED");
  });

  test("una cita cancelada da 409 APPOINTMENT_CHANGED", async () => {
    const scenario = await createPortalScenario("slots-cancelled");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await updateAppointment(managed.appointmentId, { status: "CANCELLED" });
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_AFTER_DEADLINE),
    );

    const response = await client.slots(managed.token, rangeQuery(3, 4));

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("APPOINTMENT_CHANGED");
  });

  test("un rango inválido da 400 tras resolver el token", async () => {
    const scenario = await createPortalScenario("slots-400");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const invalidQueries = [
      "",
      `?from=${limaDate(3)}`,
      "?from=ayer&to=hoy",
      `?from=${limaDate(5)}&to=${limaDate(3)}`,
      rangeQuery(0, 40),
      `?from=${limaDate(0)}&to=${limaDate(DAYS_BEYOND_BOOKING_RANGE)}`,
    ];

    for (const query of invalidQueries) {
      const response = await client.slots(managed.token, query);
      expect(response.status(), query).toBe(400);
      expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
      expect((await response.json()).code).toBe("BAD_REQUEST");
    }
  });
});

test.describe("GET /appointment/manage/:token/has-slots - hay horarios para reprogramar", () => {
  test("responde hasSlots true si el médico tiene horarios a 12 h o más", async () => {
    const scenario = await createPortalScenario("has-slots-true");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const response = await client.hasSlots(managed.token);

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
    expect(await response.json()).toEqual({ hasSlots: true });
  });

  test("responde hasSlots false si el médico no tiene horarios", async () => {
    const scenario = await createPortalScenario("has-slots-false");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await removeAvailability(managed.doctorProfileId);

    const response = await client.hasSlots(managed.token);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ hasSlots: false });
  });

  test("token inválido, desconocido o de cita empezada dan el mismo 404 sin caché", async () => {
    const scenario = await createPortalScenario("has-slots-404");
    const started = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    await updateAppointment(started.appointmentId, {
      scheduledAt: new Date(Date.now() - 2 * MILLISECONDS_PER_HOUR),
    });

    const responses = [
      await client.hasSlots("a".repeat(64)),
      await client.hasSlots("token-invalido"),
      await client.hasSlots(started.token),
    ];

    for (const response of responses) {
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("una cita ya reprogramada da 409 RESCHEDULE_NOT_ALLOWED y una cancelada APPOINTMENT_CHANGED", async () => {
    const scenario = await createPortalScenario("has-slots-409");
    const rescheduled = await createManagedAppointment(scenario);
    const cancelled = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(12, "10:00"),
    });
    const client = await createPortalClient();
    await updateAppointment(rescheduled.appointmentId, { rescheduleCount: 1 });
    await updateAppointment(cancelled.appointmentId, { status: "CANCELLED" });

    const rescheduledResponse = await client.hasSlots(rescheduled.token);
    const cancelledResponse = await client.hasSlots(cancelled.token);

    expect(rescheduledResponse.status()).toBe(409);
    expect((await rescheduledResponse.json()).code).toBe(
      "RESCHEDULE_NOT_ALLOWED",
    );
    expect(cancelledResponse.status()).toBe(409);
    expect((await cancelledResponse.json()).code).toBe("APPOINTMENT_CHANGED");
  });
});
