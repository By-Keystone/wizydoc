import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import {
  createClinicResourceViaPrisma,
  createSpecialty,
} from "../../support/accounts";
import { readEmailsTo } from "../../support/email";
import { softDeleteMembership } from "../../support/invitations";
import { uniqueName } from "../../support/users";
import {
  addPortalDoctor,
  countActiveAppointmentsAt,
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
  removeAvailability,
  updateAppointment,
  type ManagedAppointment,
  type PortalScenario,
} from "../../support/appointment-portal";

// docs/features/autogestion-paciente/prd.html — CA-11, CA-23 a CA-35 (parte API).

const HOURS_BEFORE_DEADLINE = 6;
const HOURS_BELOW_LEAD = 11;
const HOURS_ABOVE_LEAD = 13;
const DAYS_BEYOND_BOOKING_RANGE = 400;
const RACE_ROUNDS = 4;
const ALREADY_RESCHEDULED_MESSAGE =
  "Esta cita ya se reprogramó una vez y no se puede volver a reprogramar. Si necesitas otro horario, cancélala y reserva de nuevo.";
const LESS_THAN_NOTICE_MESSAGE =
  "Ya no puedes cambiar esta cita desde este enlace porque faltan menos de 12 horas.";
const SLOT_TAKEN_MESSAGE =
  /^Otro paciente acaba de tomar el horario del .+, \d{2}:\d{2}\. Elige otro\.$/;
const NEW_DAY = 11;
const ORIGINAL_DAY = 10;

async function expectUnchanged(
  managed: ManagedAppointment,
  expected: { status?: string; rescheduleCount?: number } = {},
) {
  const stored = await readAppointment(managed.appointmentId);
  expect(stored.status).toBe(expected.status ?? "PENDING");
  expect(stored.rescheduleCount).toBe(expected.rescheduleCount ?? 0);
  expect(limaWallTime(stored.scheduledAt)).toBe(managed.scheduledAt);
  expect(stored.doctorProfileId).toBe(managed.doctorProfileId);
}

async function bookedAppointmentWithDoctors(label: string) {
  const scenario = await createPortalScenario(label);
  const managed = await createManagedAppointment(scenario);
  const client = await createPortalClient();
  return { scenario, managed, client };
}

async function addDoctorWithoutSlotsForOriginal(
  scenario: PortalScenario,
  managed: ManagedAppointment,
  label: string,
) {
  await removeAvailability(managed.doctorProfileId);
  return addPortalDoctor({
    label,
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
  });
}

test.describe("POST /appointment/manage/:token/reschedule - cambio de horario", () => {
  test("CA-25 y CA-26: mueve la cita, cuenta una reprogramación, conserva médico, sede, especialidad y duración, y el mismo enlace muestra la hora nueva", async () => {
    const { scenario, managed, client } =
      await bookedAppointmentWithDoctors("resched-ok");
    const newWallTime = limaWallTimeInDays(NEW_DAY, "11:30");

    const response = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
      expectedScheduledAt: managed.scheduledAt,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "PENDING",
      date: newWallTime.slice(0, 10),
      time: "11:30",
      doctorProfileId: scenario.doctor.doctorProfileId,
      clinicId: scenario.clinicId,
      specialty: scenario.specialtyName,
      durationMinutes: 30,
      canCancel: true,
      rescheduleBlockedBy: "LIMIT",
    });
    const rawBody = JSON.stringify(body);
    for (const forbidden of [
      managed.patient.lastName,
      managed.patient.documentNumber,
      managed.patient.phone,
      managed.patient.email,
      managed.appointmentId,
      managed.patientId,
    ]) {
      expect(rawBody).not.toContain(forbidden);
    }
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.rescheduleCount).toBe(1);
    expect(limaWallTime(stored.scheduledAt)).toBe(newWallTime);
    expect(
      await countActiveAppointmentsAt(managed.doctorProfileId, newWallTime),
    ).toBe(1);
    const reopened = await (await client.get(managed.token)).json();
    expect(reopened).toMatchObject({
      date: newWallTime.slice(0, 10),
      time: "11:30",
    });
  });

  test("CA-26 y CA-22: el horario anterior queda libre para otro paciente y el nuevo ocupado", async () => {
    const { scenario, managed, client } =
      await bookedAppointmentWithDoctors("resched-frees-slot");
    const newWallTime = limaWallTimeInDays(NEW_DAY, "11:00");
    await client.reschedule(managed.token, { scheduledAt: newWallTime });

    const oldSlot = await postBooking(
      scenario,
      managed.doctorProfileId,
      managed.scheduledAt,
      newPortalPatient(),
    );
    const newSlot = await postBooking(
      scenario,
      managed.doctorProfileId,
      newWallTime,
      newPortalPatient(),
    );

    expect(oldSlot.status()).toBe(200);
    expect(newSlot.status()).toBe(409);
    expect(
      await countActiveAppointmentsAt(
        managed.doctorProfileId,
        managed.scheduledAt,
      ),
    ).toBe(1);
    expect(
      await countActiveAppointmentsAt(managed.doctorProfileId, newWallTime),
    ).toBe(1);
  });

  test("CA-29: una segunda reprogramación se rechaza con el mensaje de límite, sin mover la cita; cancelar sigue activo", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("resched-twice");
    const firstWallTime = limaWallTimeInDays(NEW_DAY, "11:00");
    await client.reschedule(managed.token, { scheduledAt: firstWallTime });

    const second = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(12, "12:00"),
    });
    const portal = await (await client.get(managed.token)).json();

    expect(second.status()).toBe(409);
    expect(await second.json()).toEqual({
      message: ALREADY_RESCHEDULED_MESSAGE,
      code: "RESCHEDULE_NOT_ALLOWED",
    });
    expect(portal.rescheduleBlockedBy).toBe("LIMIT");
    expect(portal.canCancel).toBe(true);
    expect(
      limaWallTime((await readAppointment(managed.appointmentId)).scheduledAt),
    ).toBe(firstWallTime);
    expect((await client.cancel(managed.token)).status()).toBe(200);
  });

  test("CA-28: a menos de 12 h se rechaza reprogramar, también si ya se reprogramó una vez, y la cita no se mueve", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("resched-late");
    await moveAppointmentTo(
      managed.appointmentId,
      limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    );
    const lateManaged = {
      ...managed,
      scheduledAt: limaWallTime(
        (await readAppointment(managed.appointmentId)).scheduledAt,
      ),
    };

    const firstAttempt = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
    });
    await updateAppointment(managed.appointmentId, { rescheduleCount: 1 });
    const secondAttempt = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
    });
    const portal = await (await client.get(managed.token)).json();

    for (const attempt of [firstAttempt, secondAttempt]) {
      expect(attempt.status()).toBe(409);
      expect(await attempt.json()).toEqual({
        message: LESS_THAN_NOTICE_MESSAGE,
        code: "RESCHEDULE_NOT_ALLOWED",
      });
    }
    expect(portal.rescheduleBlockedBy).toBe("DEADLINE");
    await expectUnchanged(lateManaged, { rescheduleCount: 1 });
  });
});

test.describe("POST /appointment/manage/:token/reschedule - horarios que no se ofrecen", () => {
  test("CA-27: un horario a menos de 12 h se rechaza como SLOT_TAKEN sin mover la cita ni mandar correos; a más de 12 h se acepta", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("resched-lead");
    const emailsBefore = readEmailsTo(managed.patient.email).length;

    const tooSoon = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInHours(HOURS_BELOW_LEAD),
    });
    const soonest = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInHours(HOURS_BEFORE_DEADLINE),
    });

    expect(tooSoon.status()).toBe(409);
    expect((await tooSoon.json()).code).toBe("SLOT_TAKEN");
    expect(soonest.status()).toBe(409);
    expect((await soonest.json()).code).toBe("SLOT_TAKEN");
    await expectUnchanged(managed);
    expect(readEmailsTo(managed.patient.email)).toHaveLength(emailsBefore);

    const farEnough = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInHours(HOURS_ABOVE_LEAD),
    });
    expect(farEnough.status()).toBe(200);
  });

  test("CA-30: fuera de la disponibilidad, en el pasado, más allá del rango, a una hora que no es un hueco o la hora actual de la cita responde SLOT_TAKEN sin cambios", async () => {
    const scenario = await createPortalScenario("resched-offered");
    const morningDoctor = await addPortalDoctor({
      label: "mananero",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
      availability: "mornings",
    });
    const managed = await createManagedAppointment(scenario, {
      doctorProfileId: morningDoctor.doctorProfileId,
    });
    const client = await createPortalClient();
    const rejectedWallTimes = {
      "fuera del horario del médico (15:00)": limaWallTimeInDays(
        NEW_DAY,
        "15:00",
      ),
      "justo al terminar la disponibilidad (12:00)": limaWallTimeInDays(
        NEW_DAY,
        "12:00",
      ),
      "antes de que empiece la disponibilidad (08:30)": limaWallTimeInDays(
        NEW_DAY,
        "08:30",
      ),
      "en el pasado": limaWallTimeInDays(-1, "10:00"),
      "más allá del rango del booking": limaWallTimeInDays(
        DAYS_BEYOND_BOOKING_RANGE,
        "10:00",
      ),
      "una hora que no es un hueco (10:15)": limaWallTimeInDays(
        NEW_DAY,
        "10:15",
      ),
      "la misma hora de la cita": managed.scheduledAt,
    };

    for (const [reason, scheduledAt] of Object.entries(rejectedWallTimes)) {
      const response = await client.reschedule(managed.token, { scheduledAt });

      expect(response.status(), reason).toBe(409);
      expect((await response.json()).code, reason).toBe("SLOT_TAKEN");
    }
    await expectUnchanged(managed);

    const inside = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:30"),
    });
    expect(inside.status()).toBe(200);
  });

  test("CA-31: si otro paciente tomó el horario responde SLOT_TAKEN con el mensaje del día y la hora, sin mover la cita ni mandar correos", async () => {
    const { scenario, managed, client } =
      await bookedAppointmentWithDoctors("resched-taken");
    const takenWallTime = limaWallTimeInDays(NEW_DAY, "11:00");
    const otherPatient = newPortalPatient();
    const booking = await postBooking(
      scenario,
      managed.doctorProfileId,
      takenWallTime,
      otherPatient,
    );
    expect(booking.status()).toBe(200);
    const emailsBefore = readEmailsTo(managed.patient.email).length;

    const response = await client.reschedule(managed.token, {
      scheduledAt: takenWallTime,
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("SLOT_TAKEN");
    expect(body.message).toMatch(SLOT_TAKEN_MESSAGE);
    expect(body.message).toContain("11:00");
    await expectUnchanged(managed);
    expect(readEmailsTo(managed.patient.email)).toHaveLength(emailsBefore);
    expect(readEmailsTo(otherPatient.email)).toHaveLength(1);
  });

  test("CA-30: los campos de sede o especialidad en el cuerpo se ignoran: la cita conserva los suyos", async () => {
    const { scenario, managed, client } =
      await bookedAppointmentWithDoctors("resched-fields");

    const response = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
      clinicId: randomUUID(),
      specialty: "Otra especialidad",
      durationMinutes: 5,
    });

    expect(response.status()).toBe(200);
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.clinicId).toBe(scenario.clinicId);
    expect(stored.specialty).toBe(scenario.specialtyName);
    expect(stored.durationMinutes).toBe(30);
  });

  test("un scheduledAt mal formado o ausente responde 400 sin cambios", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("resched-malformed");
    const malformedBodies = [
      {},
      { scheduledAt: "2026-02-30T10:00" },
      { scheduledAt: "10:00" },
      { scheduledAt: `${limaWallTimeInDays(NEW_DAY, "11:00")}:00Z` },
      {
        scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
        expectedScheduledAt: "ayer",
      },
      {
        scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
        newDoctorProfileId: "no-uuid",
      },
    ];

    for (const body of malformedBodies) {
      const response = await client.reschedule(managed.token, body);

      expect(response.status(), JSON.stringify(body)).toBe(400);
    }
    await expectUnchanged(managed);
  });

  test("CA-32: reprogramar desde una pantalla vieja (hora esperada distinta o cita cancelada) responde APPOINTMENT_CHANGED y no la mueve", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("resched-stale");

    const staleTime = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
      expectedScheduledAt: limaWallTimeInDays(3, "09:00"),
    });
    await client.cancel(managed.token);
    const cancelled = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
      expectedScheduledAt: managed.scheduledAt,
    });

    for (const response of [staleTime, cancelled]) {
      expect(response.status()).toBe(409);
      expect((await response.json()).code).toBe("APPOINTMENT_CHANGED");
    }
    await expectUnchanged(managed, { status: "CANCELLED" });
  });
});

test.describe("POST /appointment/manage/:token/reschedule - cambio de médico", () => {
  test("CA-51 y CA-52: si el médico no tiene horarios se puede pasar la cita a otro de la misma sede y especialidad", async () => {
    const { scenario, managed, client } =
      await bookedAppointmentWithDoctors("doctor-change-ok");
    const otherDoctor = await addDoctorWithoutSlotsForOriginal(
      scenario,
      managed,
      "reemplazo",
    );
    const newWallTime = limaWallTimeInDays(NEW_DAY, "11:00");

    const response = await client.reschedule(managed.token, {
      scheduledAt: newWallTime,
      newDoctorProfileId: otherDoctor.doctorProfileId,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      doctorProfileId: otherDoctor.doctorProfileId,
      doctorName: `${otherDoctor.name} ${otherDoctor.lastName}`,
      clinicId: scenario.clinicId,
      specialty: scenario.specialtyName,
      durationMinutes: 30,
      rescheduleBlockedBy: "LIMIT",
    });
    const stored = await readAppointment(managed.appointmentId);
    expect(stored.doctorProfileId).toBe(otherDoctor.doctorProfileId);
    expect(stored.rescheduleCount).toBe(1);
    expect(
      await countActiveAppointmentsAt(
        managed.doctorProfileId,
        managed.scheduledAt,
      ),
    ).toBe(0);
    expect(
      (await (await client.get(managed.token)).json()).doctorProfileId,
    ).toBe(otherDoctor.doctorProfileId);
    const again = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(12, "11:00"),
      newDoctorProfileId: managed.doctorProfileId,
    });
    expect(again.status()).toBe(409);
    expect((await again.json()).code).toBe("RESCHEDULE_NOT_ALLOWED");
  });

  test("CA-52: con el médico nuevo sólo valen los horarios de ese médico", async () => {
    const { scenario, managed, client } = await bookedAppointmentWithDoctors(
      "doctor-change-slots",
    );
    await removeAvailability(managed.doctorProfileId);
    const morningDoctor = await addPortalDoctor({
      label: "reemplazo-manana",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
      availability: "mornings",
    });

    const outside = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "15:00"),
      newDoctorProfileId: morningDoctor.doctorProfileId,
    });

    expect(outside.status()).toBe(409);
    expect((await outside.json()).code).toBe("SLOT_TAKEN");
    await expectUnchanged(managed);
  });

  test("CA-30: si el médico actual aún tiene horarios no se puede cambiar de médico", async () => {
    const { scenario, managed, client } = await bookedAppointmentWithDoctors(
      "doctor-change-has-slots",
    );
    const otherDoctor = await addPortalDoctor({
      label: "otro",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
    });

    const response = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
      newDoctorProfileId: otherDoctor.doctorProfileId,
    });

    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("DOCTOR_CHANGE_NOT_ALLOWED");
    await expectUnchanged(managed);
  });

  test("CA-30: indicar al mismo médico actual cuenta como no cambiar de médico", async () => {
    const { managed, client } =
      await bookedAppointmentWithDoctors("doctor-change-same");

    const response = await client.reschedule(managed.token, {
      scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
      newDoctorProfileId: managed.doctorProfileId,
    });

    expect(response.status()).toBe(200);
    expect((await readAppointment(managed.appointmentId)).doctorProfileId).toBe(
      managed.doctorProfileId,
    );
  });

  test("CA-30: un médico de otra sede, de otra especialidad, sin membership, de otra cuenta o inexistente se rechaza aunque el actual no tenga horarios", async () => {
    const { scenario, managed, client } = await bookedAppointmentWithDoctors(
      "doctor-change-invalid",
    );
    await removeAvailability(managed.doctorProfileId);

    const otherClinicId = await createClinicResourceViaPrisma(
      scenario.admin,
      scenario.organizationId,
      {
        name: uniqueName("Sede-otra"),
      },
    );
    const doctorInOtherClinic = await addPortalDoctor({
      label: "otra-sede",
      clinicId: otherClinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
    });
    const otherSpecialtyId = await createSpecialty(
      scenario.admin,
      scenario.organizationId,
      uniqueName("Otra-especialidad"),
    );
    const doctorWithOtherSpecialty = await addPortalDoctor({
      label: "otra-especialidad",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: otherSpecialtyId,
    });
    const removedDoctor = await addPortalDoctor({
      label: "sin-membership",
      clinicId: scenario.clinicId,
      admin: scenario.admin,
      specialtyId: scenario.specialtyId,
    });
    await softDeleteMembership(removedDoctor.membershipId);
    const foreignScenario = await createPortalScenario("doctor-change-foreign");
    const rejectedDoctorIds = {
      "médico de otra sede": doctorInOtherClinic.doctorProfileId,
      "médico de otra especialidad": doctorWithOtherSpecialty.doctorProfileId,
      "médico con la membership borrada": removedDoctor.doctorProfileId,
      "médico de otra cuenta": foreignScenario.doctor.doctorProfileId,
      "médico inexistente": randomUUID(),
    };

    for (const [reason, newDoctorProfileId] of Object.entries(
      rejectedDoctorIds,
    )) {
      const response = await client.reschedule(managed.token, {
        scheduledAt: limaWallTimeInDays(NEW_DAY, "11:00"),
        newDoctorProfileId,
      });

      expect(response.status(), reason).toBe(409);
      expect((await response.json()).code, reason).toBe(
        "DOCTOR_CHANGE_NOT_ALLOWED",
      );
    }
    await expectUnchanged(managed);
  });
});

async function bookAndManage(
  scenario: PortalScenario,
  scheduledAt: string,
): Promise<ManagedAppointment> {
  return createManagedAppointment(scenario, { scheduledAt });
}

function statusCodes(responses: { status(): number }[]): number[] {
  return responses.map((response) => response.status()).sort();
}

test.describe("POST /appointment/manage/:token/reschedule - simultaneidad", () => {
  test("CA-33: dos reprogramaciones simultáneas a horarios distintos aplican sólo una y cuentan una reprogramación", async () => {
    const scenario = await createPortalScenario("race-two-reschedules");
    const client = await createPortalClient();

    for (let round = 0; round < RACE_ROUNDS; round++) {
      const managed = await bookAndManage(
        scenario,
        limaWallTimeInDays(ORIGINAL_DAY + round, "10:00"),
      );
      const firstTarget = limaWallTimeInDays(20 + round, "11:00");
      const secondTarget = limaWallTimeInDays(20 + round, "12:00");

      const responses = await Promise.all([
        client.reschedule(managed.token, {
          scheduledAt: firstTarget,
          expectedScheduledAt: managed.scheduledAt,
        }),
        client.reschedule(managed.token, {
          scheduledAt: secondTarget,
          expectedScheduledAt: managed.scheduledAt,
        }),
      ]);

      expect(statusCodes(responses), `ronda ${round}`).toEqual([200, 409]);
      const loser = responses.filter(
        (response) => response.status() === 409,
      )[0];
      expect(["APPOINTMENT_CHANGED", "RESCHEDULE_NOT_ALLOWED"]).toContain(
        (await loser.json()).code,
      );
      const stored = await readAppointment(managed.appointmentId);
      expect(stored.rescheduleCount).toBe(1);
      expect([firstTarget, secondTarget]).toContain(
        limaWallTime(stored.scheduledAt),
      );
      const activeAtTargets =
        (await countActiveAppointmentsAt(
          managed.doctorProfileId,
          firstTarget,
        )) +
        (await countActiveAppointmentsAt(
          managed.doctorProfileId,
          secondTarget,
        ));
      expect(activeAtTargets).toBe(1);
    }
  });

  test("CA-34: una reprogramación y una reserva nueva simultáneas al mismo horario dejan una sola cita activa", async () => {
    const scenario = await createPortalScenario("race-reschedule-booking");
    const client = await createPortalClient();

    for (let round = 0; round < RACE_ROUNDS; round++) {
      const managed = await bookAndManage(
        scenario,
        limaWallTimeInDays(ORIGINAL_DAY + round, "10:00"),
      );
      const contestedWallTime = limaWallTimeInDays(20 + round, "11:00");

      const [reschedule, booking] = await Promise.all([
        client.reschedule(managed.token, { scheduledAt: contestedWallTime }),
        postBooking(
          scenario,
          managed.doctorProfileId,
          contestedWallTime,
          newPortalPatient(),
        ),
      ]);

      expect(
        [reschedule.status(), booking.status()].sort(),
        `ronda ${round}`,
      ).toEqual([200, 409]);
      expect(
        await countActiveAppointmentsAt(
          managed.doctorProfileId,
          contestedWallTime,
        ),
      ).toBe(1);
      const stored = await readAppointment(managed.appointmentId);
      if (reschedule.status() === 200) {
        expect(limaWallTime(stored.scheduledAt)).toBe(contestedWallTime);
        expect(stored.rescheduleCount).toBe(1);
      } else {
        expect((await reschedule.json()).code).toBe("SLOT_TAKEN");
        await expectUnchanged(managed);
      }
    }
  });

  test("CA-35: cancelar y reprogramar a la vez con la hora esperada dejan un solo resultado (cancelada o movida)", async () => {
    const scenario = await createPortalScenario("race-cancel-reschedule");
    const client = await createPortalClient();

    for (let round = 0; round < RACE_ROUNDS; round++) {
      const managed = await bookAndManage(
        scenario,
        limaWallTimeInDays(ORIGINAL_DAY + round, "10:00"),
      );
      const target = limaWallTimeInDays(20 + round, "11:00");

      const [cancel, reschedule] = await Promise.all([
        client.cancel(managed.token, {
          expectedScheduledAt: managed.scheduledAt,
        }),
        client.reschedule(managed.token, {
          scheduledAt: target,
          expectedScheduledAt: managed.scheduledAt,
        }),
      ]);

      expect(
        [cancel.status(), reschedule.status()].sort(),
        `ronda ${round}`,
      ).toEqual([200, 409]);
      const stored = await readAppointment(managed.appointmentId);
      if (cancel.status() === 200) {
        expect(stored.status).toBe("CANCELLED");
        expect(stored.rescheduleCount).toBe(0);
        expect(limaWallTime(stored.scheduledAt)).toBe(managed.scheduledAt);
      } else {
        expect(stored.status).toBe("PENDING");
        expect(stored.rescheduleCount).toBe(1);
        expect(limaWallTime(stored.scheduledAt)).toBe(target);
      }
    }
  });

  test("CA-35: cancelar y reprogramar a la vez sin hora esperada dejan un estado que coincide con lo que respondió cada petición", async () => {
    const scenario = await createPortalScenario("race-cancel-reschedule-blind");
    const client = await createPortalClient();

    for (let round = 0; round < RACE_ROUNDS; round++) {
      const managed = await bookAndManage(
        scenario,
        limaWallTimeInDays(ORIGINAL_DAY + round, "10:00"),
      );
      const target = limaWallTimeInDays(20 + round, "11:00");

      const [cancel, reschedule] = await Promise.all([
        client.cancel(managed.token),
        client.reschedule(managed.token, { scheduledAt: target }),
      ]);

      const stored = await readAppointment(managed.appointmentId);
      expect(cancel.status(), `ronda ${round}`).toBe(200);
      expect(stored.status).toBe("CANCELLED");
      expect(stored.rescheduleCount).toBe(reschedule.status() === 200 ? 1 : 0);
      expect(limaWallTime(stored.scheduledAt)).toBe(
        reschedule.status() === 200 ? target : managed.scheduledAt,
      );
      if (reschedule.status() !== 200) {
        expect((await reschedule.json()).code).toBe("APPOINTMENT_CHANGED");
      }
    }
  });
});
