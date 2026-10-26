import type { Browser } from "@playwright/test";
import { bookingPath, openBooking, stepTitle } from "../../support/booking-ui";
import { PLATFORM_BASE_URL } from "../../support/env";
import {
  addTeamMember,
  closedHeading,
  createListedClinic,
  expectMissedBookings,
  expectMissedBookingsStay,
  limaToday,
  readMissedBookingMarks,
} from "../../support/monthly-cap";
import { expect, test } from "../../support/test";
import { loginAndGoTo } from "../../support/ui";

// docs/features/tope-citas-mes/plan.md: CA-63 (sin sesión), CA-64 (visitas que no cuentan) y CA-66.

const PREVIEW_AND_CRAWLER_AGENTS = [
  "WhatsApp/2.23.20.0",
  "facebookexternalhit/1.1",
  "Googlebot/2.1",
];

async function openClosedBookingInNewBrowser(
  browser: Browser,
  clinicId: string,
  userAgent?: string,
) {
  const context = await browser.newContext({
    baseURL: PLATFORM_BASE_URL,
    userAgent,
  });
  const page = await context.newPage();
  await openBooking(page, clinicId);
  await expect(closedHeading(page)).toBeVisible();
  return { context, page };
}

test("CA-63: un navegador sin sesión que abre el link cerrado suma 1, recargar ese día no suma más y otro navegador suma 1", async ({
  browser,
}) => {
  const world = await createListedClinic("missed-ui-ca63", { booked: 10 });

  const first = await openClosedBookingInNewBrowser(browser, world.clinicId);
  await expectMissedBookings(world.accountId, 1);
  await first.page.reload();
  await expect(closedHeading(first.page)).toBeVisible();
  await openBooking(first.page, world.clinicId);
  await expect(closedHeading(first.page)).toBeVisible();
  await expectMissedBookingsStay(world.accountId, 1);

  const second = await openClosedBookingInNewBrowser(browser, world.clinicId);
  await expectMissedBookings(world.accountId, 2);

  await first.context.close();
  await second.context.close();
});

test("CA-64: no suman la visita de un usuario de la cuenta con sesión, la de una vista previa o un buscador, ni la de un link abierto", async ({
  browser,
  page,
}) => {
  const world = await createListedClinic("missed-ui-ca64", { booked: 10 });
  const open = await createListedClinic("missed-ui-ca64-abierta", {
    booked: 3,
  });
  const doctor = await addTeamMember(world, "DOCTOR");
  const user = await addTeamMember(world, "USER");

  for (const email of [world.owner.email, doctor.email, user.email]) {
    await page.context().clearCookies();
    await loginAndGoTo(page, email, bookingPath(world.clinicId));
    await expect(closedHeading(page), email).toBeVisible();
  }
  for (const userAgent of PREVIEW_AND_CRAWLER_AGENTS) {
    const visit = await openClosedBookingInNewBrowser(
      browser,
      world.clinicId,
      userAgent,
    );
    await visit.context.close();
  }
  await openBooking(page, open.clinicId);
  await expect(stepTitle(page, "datetime")).toBeVisible();
  await expectMissedBookingsStay(world.accountId, 0);
  await expectMissedBookingsStay(open.accountId, 0);

  const patientVisit = await openClosedBookingInNewBrowser(
    browser,
    world.clinicId,
  );
  await expectMissedBookings(world.accountId, 1);
  await patientVisit.context.close();
});

test("CA-66: la marca contra el doble conteo es una clave de localStorage con el clinicId y la fecha de Lima, sin otro identificador", async ({
  browser,
}) => {
  const world = await createListedClinic("missed-ui-ca66", { booked: 10 });

  const visit = await openClosedBookingInNewBrowser(browser, world.clinicId);
  await expectMissedBookings(world.accountId, 1);

  expect(await readMissedBookingMarks(visit.page)).toEqual({
    [`missed-booking:${world.clinicId}`]: limaToday(),
  });
  const storedEntries = await visit.page.evaluate(
    () => Object.keys(localStorage).length,
  );
  expect(storedEntries).toBe(1);
  await visit.context.close();
});
