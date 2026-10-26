import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import {
  bookingPath,
  chooseSlotAndGoToPatientStep,
  openBooking,
  stepTitle,
} from "../../support/booking-ui";
import {
  addSecondDoctor,
  BOOKING_CLOSED_BODY,
  BOOKING_CLOSED_MESSAGE,
  bookSeveral,
  closedHeading,
  createListedClinic,
  expectMissedBookings,
  expectMissedBookingsStay,
  expectNoPlanTalk,
  fillPatientDetails,
  limaToday,
  MOBILE_CONTACT,
  newPatientDetails,
  postBookingTo,
  readMissedBookingMarks,
  readMonthlyBookings,
  setMonthlyBookings,
  slotInDays,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { loginAndGoTo } from "../../support/ui";

// docs/features/tope-citas-mes/plan.md: CA-2, CA-22, CA-23 (tras el rechazo) y la parte de CA-63 con sesión.

const BOOKINGS_BEFORE_THE_CAP = 10;
const BOOKINGS_PER_DOCTOR = 5;
const ONE_MORE_THAN_THE_CAP = 20;

test("CA-2: reservando de verdad, las reservas 1 a 10 se aceptan repartidas entre dos médicos, la siguiente recibe 409 y el link muestra el mensaje", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca2");
  const secondDoctor = await addSecondDoctor(world);

  await bookSeveral([world, secondDoctor], BOOKINGS_BEFORE_THE_CAP);

  const prisma = await getTestPrisma();
  expect(
    await prisma.appointment.count({ where: { clinicId: world.clinicId } }),
  ).toBe(BOOKINGS_BEFORE_THE_CAP);
  for (const doctor of [world, secondDoctor]) {
    expect(
      await prisma.appointment.count({
        where: { doctorProfileId: doctor.doctorProfileId },
      }),
    ).toBe(BOOKINGS_PER_DOCTOR);
  }
  expect(await readMonthlyBookings(world.accountId)).toBe(
    BOOKINGS_BEFORE_THE_CAP,
  );

  const refused = await postBookingTo(world, slotInDays(ONE_MORE_THAN_THE_CAP));
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual(BOOKING_CLOSED_BODY);
  await openBooking(page, world.clinicId);
  await expect(closedHeading(page)).toBeVisible();
  expect(
    await prisma.appointment.count({ where: { clinicId: world.clinicId } }),
  ).toBe(BOOKINGS_BEFORE_THE_CAP);
});

test("CA-22 y CA-23: si el contador llega a 10 mientras el paciente llena «Tus datos», al confirmar ve la página cerrada con el foco en el mensaje, sin toast ni cita, y con una sola reserva perdida", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca22", {
    booked: 9,
    patientContact: MOBILE_CONTACT,
  });
  const details = newPatientDetails();
  await openBooking(page, world.clinicId);
  await chooseSlotAndGoToPatientStep(page);
  await fillPatientDetails(page, details);
  await setMonthlyBookings(world.accountId, 10);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(closedHeading(page)).toBeVisible();
  await expect(closedHeading(page)).toBeFocused();
  await expect(stepTitle(page, "success")).toHaveCount(0);
  await expect(
    page.getByText(BOOKING_CLOSED_MESSAGE, { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Para pedir una cita, escribe o llama al consultorio.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Llamar al 987 654 321" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expectNoPlanTalk(page);
  const prisma = await getTestPrisma();
  expect(
    await prisma.patient.count({ where: { accountId: world.accountId } }),
  ).toBe(0);
  expect(
    await prisma.appointment.count({ where: { clinicId: world.clinicId } }),
  ).toBe(0);
  expect(readEmailsTo(details.email)).toHaveLength(0);
  await expectMissedBookings(world.accountId, 1);
  await expectMissedBookingsStay(world.accountId, 1);
  expect(await readMissedBookingMarks(page)).toEqual({
    [`missed-booking:${world.clinicId}`]: limaToday(),
  });
});

test("CA-63: el rechazo al confirmar suma una reserva perdida también cuando quien confirma tiene sesión del consultorio", async ({
  page,
}) => {
  const world = await createListedClinic("closed-ca63-sesion", { booked: 9 });
  const details = newPatientDetails();
  await loginAndGoTo(page, world.owner.email, bookingPath(world.clinicId));
  await chooseSlotAndGoToPatientStep(page);
  await fillPatientDetails(page, details);
  await setMonthlyBookings(world.accountId, 10);

  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(closedHeading(page)).toBeVisible();
  await expectMissedBookings(world.accountId, 1);
  await expectMissedBookingsStay(world.accountId, 1);
});
