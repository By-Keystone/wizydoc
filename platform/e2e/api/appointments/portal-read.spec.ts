import { randomBytes } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import { createApiContext } from "../../support/accounts";
import { readEmailsTo } from "../../support/email";
import {
  bookingRequestBody,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  LINK_UNAVAILABLE_MESSAGE,
  limaWallTimeInDays,
  limaWallTimeInHours,
  moveAppointmentTo,
  NO_STORE_CACHE_CONTROL,
  newPortalPatient,
  readAppointment,
  updateAppointment,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — CA-2, CA-4 a CA-7, CA-11, CA-12, CA-14, CA-15 y CA-49 (parte API).

const PORTAL_KEYS = [
  "canCancel",
  "clinicAddress",
  "clinicId",
  "clinicName",
  "date",
  "doctorName",
  "doctorProfileId",
  "durationMinutes",
  "patientName",
  "rescheduleBlockedBy",
  "specialty",
  "status",
  "time",
];
const UNAVAILABLE_BODY = {
  message: LINK_UNAVAILABLE_MESSAGE,
  code: "NOT_FOUND",
};
const HOURS_IN_THE_PAST = -2;
const LONG_TOKEN_LENGTH = 500;
const TOKEN_LONGER_THAN_ROUTE_PARAM_LIMIT = 3000;

function flipLastCharacter(token: string): string {
  const last = token.at(-1) === "0" ? "1" : "0";
  return `${token.slice(0, -1)}${last}`;
}

test.describe("GET /appointment/manage/:token", () => {
  test("CA-4 y CA-5: devuelve la cita con la fecha y la hora de Lima y exactamente las claves de la página", async () => {
    const scenario = await createPortalScenario("portal-get");
    const managed = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(10, "10:00"),
    });
    const client = await createPortalClient();

    const response = await client.get(managed.token);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(PORTAL_KEYS);
    expect(body).toEqual({
      status: "PENDING",
      patientName: managed.patient.name,
      specialty: scenario.specialtyName,
      doctorName: `${scenario.doctor.name} ${scenario.doctor.lastName}`,
      doctorProfileId: scenario.doctor.doctorProfileId,
      clinicId: scenario.clinicId,
      clinicName: scenario.clinicName,
      clinicAddress: scenario.clinicAddress,
      date: managed.scheduledAt.slice(0, 10),
      time: "10:00",
      durationMinutes: 30,
      canCancel: true,
      rescheduleBlockedBy: null,
    });
  });

  test("CA-6: el nombre del médico es su nombre completo, sin Dr. ni Dra.", async () => {
    const scenario = await createPortalScenario("portal-doctor-name");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const body = await (await client.get(managed.token)).json();

    expect(body.doctorName).not.toMatch(/\bDra?\./);
    expect(body.doctorName).not.toMatch(/\bel doctor\b|\bla doctora\b/i);
  });

  test("CA-7 y CA-11: no trae apellidos, documento, teléfono, correo, fecha de nacimiento, teléfono de la sede ni ids de la cita o de la ficha", async () => {
    const scenario = await createPortalScenario("portal-privacy");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    const response = await client.get(managed.token);
    const rawBody = await response.text();

    const forbiddenValues = [
      managed.patient.lastName,
      managed.patient.documentNumber,
      managed.patient.phone,
      managed.patient.email,
      managed.patient.birthDate,
      managed.appointmentId,
      managed.patientId,
      scenario.clinicPhone,
      managed.token,
    ];
    for (const forbidden of forbiddenValues) {
      expect(rawBody).not.toContain(forbidden);
    }
    expect(Object.keys(JSON.parse(rawBody)).sort()).toEqual(PORTAL_KEYS);
  });

  test("CA-12: GET, cancelar, reprogramar y los 404 responden Cache-Control private, no-store", async () => {
    const scenario = await createPortalScenario("portal-cache");
    const managed = await createManagedAppointment(scenario);
    const unknownToken = randomBytes(32).toString("hex");
    const client = await createPortalClient();

    const responses = [
      await client.get(managed.token),
      await client.get(unknownToken),
      await client.get("abc"),
      await client.reschedule(managed.token, {
        scheduledAt: limaWallTimeInDays(11, "11:00"),
      }),
      await client.reschedule(managed.token, {
        scheduledAt: limaWallTimeInDays(12, "11:00"),
      }),
      await client.cancel(unknownToken),
      await client.cancel(managed.token),
    ];

    expect(responses.map((response) => response.status())).toEqual([
      200, 404, 404, 200, 409, 404, 200,
    ]);
    for (const response of responses) {
      expect(response.headers()["cache-control"]).toBe(NO_STORE_CACHE_CONTROL);
    }
  });

  test("CA-14: token inexistente, con un carácter cambiado, incompleto, con caracteres de más o muy largo responden el mismo 404", async () => {
    const scenario = await createPortalScenario("portal-unavailable");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();
    const unavailableTokens = [
      randomBytes(32).toString("hex"),
      flipLastCharacter(managed.token),
      managed.token.toUpperCase(),
      managed.token.slice(0, -1),
      `${managed.token}0`,
      "x".repeat(LONG_TOKEN_LENGTH),
      "token-invalido",
    ];

    for (const token of unavailableTokens) {
      const response = await client.get(token);

      expect(response.status(), token.slice(0, 20)).toBe(404);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("CA-14 y CA-15: un token más largo que el límite de parámetros de ruta responde el mismo 404 en GET, cancelar y reprogramar", async () => {
    const client = await createPortalClient();
    const token = "x".repeat(TOKEN_LONGER_THAN_ROUTE_PARAM_LIMIT);

    const responses = [
      await client.get(token),
      await client.cancel(token),
      await client.reschedule(token, {
        scheduledAt: limaWallTimeInDays(12, "12:00"),
      }),
    ];

    for (const response of responses) {
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("CA-14: la cita ya empezada y la cancelada cuya hora pasó responden el mismo 404", async () => {
    const scenario = await createPortalScenario("portal-started");
    const started = await createManagedAppointment(scenario);
    const cancelledInThePast = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(11, "10:00"),
    });
    await moveAppointmentTo(
      started.appointmentId,
      limaWallTimeInHours(HOURS_IN_THE_PAST),
    );
    await updateAppointment(cancelledInThePast.appointmentId, {
      status: "CANCELLED",
      cancelledAt: new Date(),
    });
    await moveAppointmentTo(
      cancelledInThePast.appointmentId,
      limaWallTimeInHours(HOURS_IN_THE_PAST),
    );
    const client = await createPortalClient();

    for (const { token } of [started, cancelledInThePast]) {
      const response = await client.get(token);

      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("CA-14: la cita cancelada antes de su hora sigue abriéndose como cancelada", async () => {
    const scenario = await createPortalScenario("portal-cancelled-open");
    const managed = await createManagedAppointment(scenario);
    await updateAppointment(managed.appointmentId, {
      status: "CANCELLED",
      cancelledAt: new Date(),
    });
    const client = await createPortalClient();

    const response = await client.get(managed.token);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("CANCELLED");
    expect(body.canCancel).toBe(false);
  });

  test("CA-15: cancelar o reprogramar con enlaces no disponibles responde 404 y no cambia ninguna cita ni manda correos", async () => {
    const scenario = await createPortalScenario("portal-unavailable-actions");
    const managed = await createManagedAppointment(scenario);
    const started = await createManagedAppointment(scenario, {
      scheduledAt: limaWallTimeInDays(11, "10:00"),
    });
    await moveAppointmentTo(
      started.appointmentId,
      limaWallTimeInHours(HOURS_IN_THE_PAST),
    );
    const client = await createPortalClient();
    const emailsBefore = readEmailsTo(managed.patient.email).length;
    const startedEmailsBefore = readEmailsTo(started.patient.email).length;
    const unavailableTokens = [
      randomBytes(32).toString("hex"),
      flipLastCharacter(managed.token),
      `${managed.token}0`,
      managed.token.slice(0, -1),
      "x".repeat(LONG_TOKEN_LENGTH),
      started.token,
    ];

    for (const token of unavailableTokens) {
      const cancel = await client.cancel(token);
      const reschedule = await client.reschedule(token, {
        scheduledAt: limaWallTimeInDays(12, "12:00"),
      });

      expect(cancel.status(), `cancel ${token.slice(0, 20)}`).toBe(404);
      expect(await cancel.json()).toEqual(UNAVAILABLE_BODY);
      expect(reschedule.status(), `reschedule ${token.slice(0, 20)}`).toBe(404);
      expect(await reschedule.json()).toEqual(UNAVAILABLE_BODY);
    }

    const untouched = await readAppointment(managed.appointmentId);
    expect(untouched.status).toBe("PENDING");
    expect(untouched.rescheduleCount).toBe(0);
    const untouchedStarted = await readAppointment(started.appointmentId);
    expect(untouchedStarted.status).toBe("PENDING");
    expect(untouchedStarted.rescheduleCount).toBe(0);
    expect(readEmailsTo(managed.patient.email)).toHaveLength(emailsBefore);
    expect(readEmailsTo(started.patient.email)).toHaveLength(
      startedEmailsBefore,
    );
  });

  test("un cuerpo mal formado con un token no disponible responde el mismo 404 (el token se resuelve antes que el cuerpo)", async () => {
    const scenario = await createPortalScenario("portal-body-after-token");
    const managed = await createManagedAppointment(scenario);
    const unknownToken = randomBytes(32).toString("hex");
    const client = await createPortalClient();
    const malformedRescheduleBodies = [
      {},
      { scheduledAt: "no es una fecha" },
      { scheduledAt: 12345 },
      { scheduledAt: limaWallTimeInDays(12, "12:00"), newDoctorProfileId: "x" },
      { scheduledAt: "2026-02-30T10:00" },
    ];

    for (const token of [unknownToken, "x".repeat(LONG_TOKEN_LENGTH)]) {
      for (const body of malformedRescheduleBodies) {
        const response = await client.reschedule(token, body);

        expect(response.status(), JSON.stringify(body)).toBe(404);
        expect(await response.json()).toEqual(UNAVAILABLE_BODY);
      }
      const cancelWithMalformedBody = await client.cancel(token, {
        expectedScheduledAt: "no es una fecha",
      });
      expect(cancelWithMalformedBody.status()).toBe(404);
      expect(await cancelWithMalformedBody.json()).toEqual(UNAVAILABLE_BODY);
    }

    const sameBodiesWithValidToken = await client.reschedule(managed.token, {
      scheduledAt: "no es una fecha",
    });
    expect(sameBodiesWithValidToken.status()).toBe(400);
  });

  test("un JSON roto con un token no disponible responde el mismo 404", async () => {
    const client = await createPortalClient();
    const unknownToken = randomBytes(32).toString("hex");

    for (const action of ["cancel", "reschedule"]) {
      const response = await client.postRaw(
        `${unknownToken}/${action}`,
        "{ esto no es json",
      );

      expect(response.status(), action).toBe(404);
      expect(await response.json()).toEqual(UNAVAILABLE_BODY);
    }
  });

  test("CA-49 (parte API): el enlace de una cuenta en Gratis abre la cita y permite cancelarla", async () => {
    const scenario = await createPortalScenario("portal-free-plan");
    const managed = await createManagedAppointment(scenario);
    const client = await createPortalClient();

    expect((await client.get(managed.token)).status()).toBe(200);
    const cancel = await client.cancel(managed.token);

    expect(cancel.status()).toBe(200);
    expect((await readAppointment(managed.appointmentId)).status).toBe(
      "CANCELLED",
    );
  });

  test("CA-2: la respuesta de POST /appointment no trae ningún enlace ni token", async () => {
    const scenario = await createPortalScenario("portal-booking-response");
    const anonymous = await createApiContext();

    const response = await anonymous.post(`${API_BASE_URL}/appointment`, {
      data: bookingRequestBody(
        scenario,
        scenario.doctor.doctorProfileId,
        limaWallTimeInDays(10, "10:00"),
        newPortalPatient(),
      ),
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ message: "Cita creada con éxito" });
    expect(await response.text()).not.toMatch(/[0-9a-f]{64}|manage/);
  });
});
