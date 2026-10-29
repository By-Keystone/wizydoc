import { newPortalPatient } from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo, waitForEmailTo } from "../../support/email";
import {
  addSecondDoctor,
  BOOKING_CLOSED_BODY,
  countMissedBookings,
  createListedClinic,
  emailsWithSubject,
  openHome,
  postBookingTo,
  readMonthlyBookings,
  REACHED_NOTICE_SUBJECT,
  slotInDays,
  usageCard,
  warningNoticeSubject,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-13 y CA-14.

const RACE_ROUNDS = 3;

async function raceForTheLastSeat(label: string) {
  const world = await createListedClinic(label, { booked: 9 });
  const secondDoctor = await addSecondDoctor(world);
  const patients = [newPortalPatient(), newPortalPatient()];
  const prisma = await getTestPrisma();
  const appointmentsBefore = await prisma.appointment.count({
    where: { clinicId: world.clinicId },
  });
  const patientsBefore = await prisma.patient.count({
    where: { accountId: world.accountId },
  });

  const responses = await Promise.all([
    postBookingTo(world, slotInDays(3), patients[0]),
    postBookingTo(secondDoctor, slotInDays(4), patients[1]),
  ]);

  return {
    world,
    patients,
    responses,
    appointmentsBefore,
    patientsBefore,
  };
}

test("CA-13: con 9 citas en el mes, dos reservas simultáneas dejan un 200 y un 409 BOOKING_CLOSED, una cita y una ficha nuevas, el contador en 10, una reserva perdida y los correos de quien entró", async () => {
  const prisma = await getTestPrisma();

  for (let round = 1; round <= RACE_ROUNDS; round++) {
    const { world, patients, responses, appointmentsBefore, patientsBefore } =
      await raceForTheLastSeat(`race-ca13-${round}`);

    expect(responses.map((response) => response.status()).sort()).toEqual([
      200, 409,
    ]);
    const winnerIndex = responses.findIndex(
      (response) => response.status() === 200,
    );
    const winner = patients[winnerIndex];
    const loser = patients[1 - winnerIndex];
    expect(await responses[1 - winnerIndex].json()).toEqual(
      BOOKING_CLOSED_BODY,
    );
    expect(
      await prisma.appointment.count({ where: { clinicId: world.clinicId } }),
    ).toBe(appointmentsBefore + 1);
    expect(
      await prisma.patient.count({ where: { accountId: world.accountId } }),
    ).toBe(patientsBefore + 1);
    expect(await readMonthlyBookings(world.accountId)).toBe(10);
    expect(await countMissedBookings(world.accountId)).toBe(1);
    await waitForEmailTo(winner.email, {
      subject: `Tu cita en ${world.clinicName} está reservada`,
    });
    expect(readEmailsTo(loser.email)).toHaveLength(0);
    expect(
      emailsWithSubject(world.owner.email, REACHED_NOTICE_SUBJECT),
    ).toHaveLength(1);
  }
});

test("CA-13: la tarjeta tras la carrera dice «Llegaste al tope de 10 citas de tu plan Gratis», no «11 de 10»", async ({
  page,
}) => {
  const { world } = await raceForTheLastSeat("race-ca13-tarjeta");

  await openHome(page, world);

  await expect(
    usageCard(page).getByRole("heading", {
      level: 2,
      name: "Llegaste al tope de 10 citas de tu plan Gratis",
    }),
  ).toBeVisible();
  await expect(usageCard(page)).not.toContainText(/\b11\b/);
});

test("CA-14: con 7 citas en el mes, dos reservas simultáneas entran las dos, quedan 9 y sale un solo aviso del 80 %", async () => {
  const world = await createListedClinic("race-ca14", { booked: 7 });
  const secondDoctor = await addSecondDoctor(world);

  const responses = await Promise.all([
    postBookingTo(world, slotInDays(3)),
    postBookingTo(secondDoctor, slotInDays(4)),
  ]);

  expect(responses.map((response) => response.status())).toEqual([200, 200]);
  expect(await readMonthlyBookings(world.accountId)).toBe(9);
  expect(
    emailsWithSubject(world.owner.email, warningNoticeSubject(8, 10)),
  ).toHaveLength(1);
  expect(
    emailsWithSubject(world.owner.email, REACHED_NOTICE_SUBJECT),
  ).toHaveLength(0);
});
