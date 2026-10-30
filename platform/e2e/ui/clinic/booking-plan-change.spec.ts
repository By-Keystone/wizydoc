import type { Browser, Page } from "@playwright/test";
import { readBookedAppointments } from "../../support/booking-scenarios";
import {
  bookFromDateStep,
  openBooking,
  stepTitle,
} from "../../support/booking-ui";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  bookSuccessfully,
  closedHeading,
  createListedClinic,
  currentMonth,
  monthName,
  openHome,
  reloadHome,
  setMonthlyBookings,
  setPlan,
  usageCard,
} from "../../support/monthly-cap";
import { getTestPrisma } from "../../support/db";
import { expect, test } from "../../support/test";

// docs/features/tope-citas-mes/plan.md: CA-17 y CA-18 (parte de navegador).

const FREE_REACHED_TITLE = "Llegaste al tope de 10 citas de tu plan Gratis";
const SEEDED_APPOINTMENTS = 119;
const BOOKED_BY_PATIENTS = 2;

async function openAsPatient(browser: Browser, clinicId: string) {
  const context = await browser.newContext({ baseURL: PLATFORM_BASE_URL });
  const patientPage = await context.newPage();
  await openBooking(patientPage, clinicId);
  return { context, patientPage };
}

async function expectCard(page: Page, title: string, count?: string) {
  await expect(
    usageCard(page).getByRole("heading", {
      level: 2,
      name: title,
      exact: true,
    }),
  ).toBeVisible();
  if (count) await expect(usageCard(page)).toContainText(count);
}

test("CA-17: subir de plan vale al instante: de Gratis a Consultorio el link vuelve a recibir reservas y la tarjeta dice «11 de 150»; de Consultorio a Clínica queda abierto con «150 de 600»", async ({
  page,
  browser,
}) => {
  const world = await createListedClinic("plan-ca17", { booked: 10 });
  const closedVisit = await openAsPatient(browser, world.clinicId);
  await expect(closedHeading(closedVisit.patientPage)).toBeVisible();
  await closedVisit.context.close();

  await setPlan(world.accountId, "CONSULTORIO");

  const reopened = await openAsPatient(browser, world.clinicId);
  await expect(stepTitle(reopened.patientPage, "datetime")).toBeVisible();
  await bookFromDateStep(reopened.patientPage);
  await reopened.context.close();
  await openHome(page, world);
  await expectCard(
    page,
    `Citas reservadas en ${monthName(currentMonth())}`,
    "11 de 150",
  );

  await setMonthlyBookings(world.accountId, 150);
  await reloadHome(page);
  await expectCard(
    page,
    "Llegaste al tope de 150 citas de tu plan Consultorio",
  );

  await setPlan(world.accountId, "CLINICA");

  const stillOpen = await openAsPatient(browser, world.clinicId);
  await expect(stepTitle(stillOpen.patientPage, "datetime")).toBeVisible();
  await stillOpen.context.close();
  await reloadHome(page);
  await expectCard(
    page,
    `Citas reservadas en ${monthName(currentMonth())}`,
    "150 de 600",
  );
});

test("CA-18: bajar de plan vale al instante: Consultorio con 120 que pasa a Gratis cierra el link y la tarjeta dice «Llegaste al tope de 10»; las citas ya reservadas siguen igual", async ({
  page,
  browser,
}) => {
  const world = await createListedClinic("plan-ca18", {
    plan: "CONSULTORIO",
    booked: SEEDED_APPOINTMENTS,
  });
  await bookSuccessfully(world, 2);
  await bookSuccessfully(world, 3);
  const prisma = await getTestPrisma();
  const appointmentsBefore = await readBookedAppointments(world.clinicId);
  const patientsBefore = await prisma.patient.count({
    where: { accountId: world.accountId },
  });
  expect(appointmentsBefore).toHaveLength(
    SEEDED_APPOINTMENTS + BOOKED_BY_PATIENTS,
  );

  await setPlan(world.accountId, "FREE");

  const closedVisit = await openAsPatient(browser, world.clinicId);
  await expect(closedHeading(closedVisit.patientPage)).toBeVisible();
  await closedVisit.context.close();
  await openHome(page, world);
  await expectCard(page, FREE_REACHED_TITLE);
  await expect(usageCard(page)).not.toContainText(/\b121\b/);
  expect(await readBookedAppointments(world.clinicId)).toEqual(
    appointmentsBefore,
  );
  expect(
    await prisma.patient.count({ where: { accountId: world.accountId } }),
  ).toBe(patientsBefore);
});
