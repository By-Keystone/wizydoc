import { randomInt } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { uniqueEmail } from "./users";

export const MOBILE_VIEWPORT = { width: 375, height: 812 };

export const STEP_TITLES = {
  specialty: "¿Qué especialidad necesitas?",
  doctor: "Elige un médico",
  datetime: "Elige fecha y horario",
  patient: "Tus datos",
  success: "¡Cita reservada!",
} as const;

export type BookingStepName = keyof typeof STEP_TITLES;

const WEEKDAY_BUTTON_NAME = /^(Lu|Ma|Mi|Ju|Vi|Sá|Do)\s*\d{1,2}$/;
const TIME_SLOT_BUTTON_NAME = /^\d{2}:\d{2}$/;
const DOCUMENT_NUMBER_DIGITS = 8;
const ONE_BILLION = 1_000_000_000;

export const bookingPath = (clinicId: string) =>
  `/clinic/${clinicId}/create-appointment`;

export const openBooking = (page: Page, clinicId: string) =>
  page.goto(bookingPath(clinicId));

export const pageHeading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

export const stepTitle = (page: Page, step: BookingStepName) =>
  page.getByRole("heading", { level: 2, name: STEP_TITLES[step], exact: true });

export const progressLabel = (page: Page, current: number, total: number) =>
  page.getByText(`Paso ${current} de ${total}`, { exact: true });

// El `header` dentro de `main` no expone un rol accesible; es la única cabecera de la página.
export const bookingHeader = (page: Page) => page.locator("header");

export const nextButton = (page: Page) =>
  page.getByRole("button", { name: "Siguiente", exact: true });

export const backButton = (page: Page) =>
  page.getByRole("button", { name: "Atrás", exact: true });

export const optionButton = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

export const dayButtons = (page: Page) =>
  page.getByRole("button", { name: WEEKDAY_BUTTON_NAME });

export const enabledDayButtons = (page: Page) =>
  page.getByRole("button", { name: WEEKDAY_BUTTON_NAME, disabled: false });

export const disabledDayButtons = (page: Page) =>
  page.getByRole("button", { name: WEEKDAY_BUTTON_NAME, disabled: true });

export const timeButtons = (page: Page) =>
  page.getByRole("button", { name: TIME_SLOT_BUTTON_NAME });

export const chosenOptions = (page: Page) =>
  page.getByRole("button", { pressed: true });

export async function expectStep(
  page: Page,
  step: BookingStepName,
  position?: { current: number; total: number },
) {
  await expect(stepTitle(page, step)).toBeVisible();
  if (position) {
    await expect(
      progressLabel(page, position.current, position.total),
    ).toBeVisible();
  }
}

export async function clickNext(page: Page) {
  await nextButton(page).click();
}

export async function clickBack(page: Page) {
  await backButton(page).click();
}

// La semana siguiente queda entera en el futuro: no depende de la hora a la que corra la prueba.
export async function pickSlot(page: Page) {
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await enabledDayButtons(page).first().click();
  await timeButtons(page).first().click();
}

export interface PatientNames {
  name: string;
  lastName: string;
}

const DEFAULT_PATIENT_NAMES: PatientNames = {
  name: "Camila",
  lastName: "Rivas",
};

export async function fillPatientForm(
  page: Page,
  names: PatientNames = DEFAULT_PATIENT_NAMES,
) {
  const documentNumber = String(randomInt(ONE_BILLION)).padStart(
    DOCUMENT_NUMBER_DIGITS,
    "0",
  );
  await page.getByLabel("Nombre").fill(names.name);
  await page.getByLabel("Apellido").fill(names.lastName);
  await page.getByLabel("N° de documento").fill(documentNumber);
  await page.getByLabel("Fecha de nacimiento").fill("1990-05-20");
  await page.getByLabel("Teléfono").fill("988888888");
  await page.getByLabel("Email").fill(uniqueEmail("paciente-booking"));
}

export async function confirmBooking(page: Page) {
  await fillPatientForm(page);
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(stepTitle(page, "success")).toBeVisible();
}

export async function chooseSlotAndGoToPatientStep(page: Page) {
  await pickSlot(page);
  await clickNext(page);
  await expectStep(page, "patient");
}

export async function bookFromDateStep(page: Page) {
  await chooseSlotAndGoToPatientStep(page);
  await confirmBooking(page);
}

const BRAND_TEAL_DARK = "rgb(11, 79, 73)";
const WHITE = "rgb(255, 255, 255)";
const NO_BACKGROUND = "rgba(0, 0, 0, 0)";

export async function expectChosenStyle(option: Locator) {
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(option).toHaveCSS("background-color", BRAND_TEAL_DARK);
  await expect(option).toHaveCSS("color", WHITE);
}

export async function expectAvailableStyle(option: Locator) {
  await expect(option).toHaveAttribute("aria-pressed", "false");
  await expect(option).toHaveCSS("background-color", WHITE);
}

export async function expectUnavailableStyle(option: Locator) {
  await expect(option).toBeDisabled();
  await expect(option).toHaveCSS("background-color", NO_BACKGROUND);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
}

export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("El elemento no tiene caja visible");
  return box;
}
