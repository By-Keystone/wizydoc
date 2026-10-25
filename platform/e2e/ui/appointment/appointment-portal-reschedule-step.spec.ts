import type { Page } from "@playwright/test";
import {
  createManagedAppointment,
  createPortalScenario,
} from "../../support/appointment-portal";
import {
  backButton,
  boxOf,
  dayButtons,
  enabledDayButtons,
  expectAvailableStyle,
  expectChosenStyle,
  expectNoHorizontalScroll,
  MOBILE_VIEWPORT,
  nextButton,
  pickSlot,
  timeButtons,
} from "../../support/booking-ui";
import { expect, test } from "../../support/test";

// booking-cabecera-y-pasos CA-32 (día y hora de «Reprogramar») y CA-42.

test.use({ viewport: MOBILE_VIEWPORT });

const MIN_DAY_HEIGHT = 52;
const ARROW_SIZE = 40;

async function openReschedule(page: Page, label: string) {
  const scenario = await createPortalScenario(label);
  const managed = await createManagedAppointment(scenario);
  await page.goto(`/appointment/manage/${managed.token}`);
  await page.getByRole("button", { name: "Reprogramar" }).click();
  await expect(
    page.getByRole("heading", { name: "Elige fecha y horario" }),
  ).toBeVisible();
  return { scenario, managed };
}

test("CA-32: en «Reprogramar» el día y la hora elegidos tienen fondo teal oscuro y texto blanco, y los demás blanco", async ({
  page,
}) => {
  await openReschedule(page, "resched-ca32");

  await pickSlot(page);
  await page.mouse.move(0, 0);

  await expectChosenStyle(enabledDayButtons(page).nth(0));
  await expectAvailableStyle(enabledDayButtons(page).nth(1));
  await expectChosenStyle(timeButtons(page).nth(0));
  await expectAvailableStyle(timeButtons(page).nth(1));
});

test("CA-42: «Atrás» vuelve a «Hola, {nombre}» y «Siguiente» se habilita al elegir día y hora", async ({
  page,
}) => {
  const { managed } = await openReschedule(page, "resched-ca42-nav");
  const summaryTitle = page.getByRole("heading", {
    name: `Hola, ${managed.patient.name}`,
  });

  await backButton(page).click();
  await expect(summaryTitle).toBeVisible();

  await page.getByRole("button", { name: "Reprogramar" }).click();
  await expect(nextButton(page)).toBeDisabled();
  await pickSlot(page);
  await expect(nextButton(page)).toBeEnabled();
  await nextButton(page).click();

  await expect(
    page.getByRole("heading", { name: "¿Cambiar tu cita a este horario?" }),
  ).toBeVisible();
});

test("CA-42: «Reprogramar» no muestra la cabecera del booking ni «Paso X de Y» y la pestaña sigue en «Tu cita · WizyDoc»", async ({
  page,
}) => {
  await openReschedule(page, "resched-ca42-header");

  await expect(page.getByText("Reserva tu cita")).toHaveCount(0);
  await expect(page.getByText(/Paso \d+ de \d+/)).toHaveCount(0);
  await expect(page).toHaveTitle("Tu cita · WizyDoc");
});

test("CA-42: a 375 px los días de «Reprogramar» miden al menos 52 px de alto, las flechas 40 × 40 y no hay desplazamiento horizontal", async ({
  page,
}) => {
  await openReschedule(page, "resched-ca42-sizes");
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await expect(enabledDayButtons(page).first()).toBeVisible();

  for (const day of await dayButtons(page).all()) {
    expect((await boxOf(day)).height).toBeGreaterThanOrEqual(MIN_DAY_HEIGHT);
  }
  for (const name of ["Semana anterior", "Semana siguiente"]) {
    const { width, height } = await boxOf(page.getByRole("button", { name }));
    expect(width).toBeCloseTo(ARROW_SIZE, 0);
    expect(height).toBeCloseTo(ARROW_SIZE, 0);
  }
  await expectNoHorizontalScroll(page);
});
