import type { Page } from "@playwright/test";
import {
  createManagedAppointment,
  createPortalScenario,
  generateAccessToken,
} from "../../support/appointment-portal";
import {
  createClinicScenario,
  createScenarioClinic,
} from "../../support/booking-scenarios";
import {
  boxOf,
  clickNext,
  confirmBooking,
  expectStep,
  MOBILE_VIEWPORT,
  openBooking,
  optionButton,
  pickSlot,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";

// booking-cabecera-y-pasos CA-29 y CA-30.

test.use({ viewport: MOBILE_VIEWPORT });
test.describe.configure({ timeout: 90_000 });

async function expectLogoOnlyInFooter(page: Page) {
  const logo = page.getByRole("img", { name: "WizyDoc", exact: true });
  const copyright = page.getByText(
    /^© \d{4} WizyDoc\. Todos los derechos reservados\.$/,
  );

  await expect(logo).toHaveCount(1);
  await expect(
    page.getByRole("contentinfo").getByRole("img", { name: "WizyDoc" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link").getByRole("img", { name: "WizyDoc" }),
  ).toHaveCount(0);
  const hrefs = await page
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.filter((href) => href?.includes("/login"))).toEqual([]);

  const logoBox = await boxOf(logo);
  const mainBox = await boxOf(page.getByRole("main"));
  const copyrightBox = await boxOf(copyright);
  expect(logoBox.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height - 1);
  expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(copyrightBox.y + 1);
}

test("CA-29: en todos los pasos del booking y en «¡Cita reservada!» el logo está solo en el pie, sin enlace", async ({
  page,
}) => {
  const scenario = await createClinicScenario("logo-ca29");
  await openBooking(page, scenario.clinicId);

  await expectStep(page, "specialty");
  await expectLogoOnlyInFooter(page);

  await optionButton(page, scenario.specialtyA.name).click();
  await clickNext(page);
  await expectStep(page, "doctor");
  await expectLogoOnlyInFooter(page);

  await optionButton(page, scenario.doctorsOfA[0].displayName).click();
  await clickNext(page);
  await expectStep(page, "datetime");
  await expectLogoOnlyInFooter(page);

  await pickSlot(page);
  await clickNext(page);
  await expectStep(page, "patient");
  await expectLogoOnlyInFooter(page);

  await confirmBooking(page);
  await expectLogoOnlyInFooter(page);
});

test("CA-29: en el estado sin médicos el logo está solo en el pie, sin enlace", async ({
  page,
}) => {
  const clinic = await createScenarioClinic("logo-ca29-empty");

  await openBooking(page, clinic.clinicId);

  await expect(
    page.getByText(/todavía no tiene médicos disponibles/),
  ).toBeVisible();
  await expectLogoOnlyInFooter(page);
});

test("CA-30: en la autogestión el logo está solo en el pie en la vista de la cita y en «Reprogramar»", async ({
  page,
}) => {
  const scenario = await createPortalScenario("logo-ca30");
  const managed = await createManagedAppointment(scenario);

  await page.goto(`/appointment/manage/${managed.token}`);
  await expect(
    page.getByRole("heading", { name: `Hola, ${managed.patient.name}` }),
  ).toBeVisible();
  await expectLogoOnlyInFooter(page);

  await page.getByRole("button", { name: "Reprogramar" }).click();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  await expectLogoOnlyInFooter(page);
});

test("CA-30: en «Este enlace ya no está disponible» el logo está solo en el pie", async ({
  page,
}) => {
  await page.goto(`/appointment/manage/${generateAccessToken().token}`);

  await expect(
    page.getByRole("heading", { name: "Este enlace ya no está disponible" }),
  ).toBeVisible();
  await expectLogoOnlyInFooter(page);
});
