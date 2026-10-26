import {
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTime,
  limaWallTimeInDays,
  readAppointment,
} from "../../support/appointment-portal";
import { readUserEmail } from "../../support/doctor-treatment";
import { readEmailsTo, waitForEmailTo } from "../../support/email";
import {
  daysUntilNextMonth,
  fetchBookingStatus,
  readMonthlyBookings,
  setMonthlyBookings,
  setPlan,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-29 y CA-30 (parte api).

const CONSULTORIO_CAP = 150;
const PATIENT_CANCELLED_SUBJECT = "Tu cita ha sido cancelada";
const PATIENT_RESCHEDULED_PREFIX = "Tu cita se ha reprogramado para el";
const DAYS_PAST_MONTH_START = 3;

async function paidAccountAtCap(label: string) {
  const scenario = await createPortalScenario(label);
  const { accountId } = scenario.admin;
  await setPlan(accountId, "CONSULTORIO");
  const managed = await createManagedAppointment(scenario);
  await setMonthlyBookings(accountId, CONSULTORIO_CAP);
  const portal = await createPortalClient();
  const doctorEmail = await readUserEmail(scenario.doctor.userId);
  return { scenario, managed, portal, doctorEmail, accountId };
}

test("CA-29: con el tope alcanzado, el paciente cancela con un motivo como siempre: salen los correos de hoy, el contador no baja y el link sigue cerrado", async () => {
  const { scenario, managed, portal, doctorEmail, accountId } =
    await paidAccountAtCap("cap-ca29");

  const response = await portal.cancel(managed.token);

  expect(response.status()).toBe(200);
  expect((await readAppointment(managed.appointmentId)).status).toBe(
    "CANCELLED",
  );
  await waitForEmailTo(managed.patient.email, {
    subject: PATIENT_CANCELLED_SUBJECT,
  });
  await waitForEmailTo(doctorEmail, {
    subject: `Tu paciente ha cancelado su cita en ${scenario.clinicName}`,
  });
  expect(await readMonthlyBookings(accountId)).toBe(CONSULTORIO_CAP);
  expect(
    (await fetchBookingStatus(scenario.clinicId)).isAcceptingBookings,
  ).toBe(false);
});

test("CA-30: con el tope alcanzado, el paciente reprograma a un horario del mes siguiente: salen los correos de hoy, el contador no cambia y el link sigue cerrado", async () => {
  const { scenario, managed, portal, doctorEmail, accountId } =
    await paidAccountAtCap("cap-ca30");
  const newWallTime = limaWallTimeInDays(
    daysUntilNextMonth() + DAYS_PAST_MONTH_START,
    "11:00",
  );

  const response = await portal.reschedule(managed.token, {
    scheduledAt: newWallTime,
    expectedScheduledAt: managed.scheduledAt,
  });

  expect(response.status()).toBe(200);
  const moved = await readAppointment(managed.appointmentId);
  expect(moved.rescheduleCount).toBe(1);
  expect(limaWallTime(moved.scheduledAt)).toBe(newWallTime);
  await waitForEmailTo(doctorEmail, {
    subject: `Tu paciente ha reprogramado la cita en ${scenario.clinicName}`,
  });
  await expect
    .poll(() =>
      readEmailsTo(managed.patient.email).some(({ subject }) =>
        subject.startsWith(PATIENT_RESCHEDULED_PREFIX),
      ),
    )
    .toBe(true);
  expect(await readMonthlyBookings(accountId)).toBe(CONSULTORIO_CAP);
  expect(
    (await fetchBookingStatus(scenario.clinicId)).isAcceptingBookings,
  ).toBe(false);
});
