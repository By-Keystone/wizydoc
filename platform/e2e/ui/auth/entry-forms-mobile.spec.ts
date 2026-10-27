import type { Page } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { alertWith } from "../../support/entry-forms";
import { expect, test } from "../../support/test";
import { loginViaUi } from "../../support/ui";
import { createConfirmedUser } from "../../support/users";

// Pantallas de entrada a 375 px.

const MOBILE_WIDTH = 375;
const MIN_TARGET_HEIGHT = 40;

test.use({ viewport: { width: MOBILE_WIDTH, height: 780 } });

const horizontalExtent = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth);

async function expectTargetHeight(
  page: Page,
  role: "link" | "button",
  name: string,
) {
  const box = await page.getByRole(role, { name, exact: true }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_HEIGHT);
}

async function expectFormWidth(page: Page, buttonName: string) {
  const button = await page
    .getByRole("button", { name: buttonName, exact: true })
    .boundingBox();
  const form = await page.locator("form").boundingBox();
  expect(Math.abs((button?.width ?? 0) - (form?.width ?? -1))).toBeLessThan(2);
}

test("el login, con sus errores a la vista, no se desplaza hacia los lados y sus enlaces y botón miden lo debido", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(alertWith(page, "Escribe tu correo.")).toBeVisible();

  expect(await horizontalExtent(page)).toBeLessThanOrEqual(MOBILE_WIDTH);
  await expectTargetHeight(page, "link", "¿Olvidaste tu contraseña?");
  await expectTargetHeight(page, "link", "Regístrate gratis");
  await expectFormWidth(page, "Iniciar sesión");
});

test("el registro, con sus errores a la vista, no se desplaza hacia los lados y sus enlaces y botón miden lo debido", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(alertWith(page, "Escribe tu celular.")).toBeVisible();

  expect(await horizontalExtent(page)).toBeLessThanOrEqual(MOBILE_WIDTH);
  await expectTargetHeight(page, "link", "Inicia sesión");
  await expectFormWidth(page, "Crear cuenta");
});

test("«Revisa tu correo» no se desplaza hacia los lados y su enlace mide lo debido", async ({
  page,
}) => {
  await page.goto("/confirm-email");
  await expect(
    page.getByRole("heading", { name: "Revisa tu correo" }),
  ).toBeVisible();

  expect(await horizontalExtent(page)).toBeLessThanOrEqual(MOBILE_WIDTH);
  await expectTargetHeight(page, "link", "Inicia sesión");
});

test("el onboarding, con su error a la vista, no se desplaza hacia los lados y su botón ocupa el formulario", async ({
  page,
}) => {
  const { email } = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "onboarding-movil",
  });
  await loginViaUi(page, email, /\/onboarding$/);
  await page
    .getByRole("button", { name: "Crear mi consultorio", exact: true })
    .click();
  await expect(
    alertWith(page, "Escribe el nombre de tu consultorio."),
  ).toBeVisible();
  await expect(
    alertWith(page, "Escribe la dirección de tu consultorio."),
  ).toBeVisible();
  await expect(alertWith(page, "Escribe tu especialidad.")).toBeVisible();

  expect(await horizontalExtent(page)).toBeLessThanOrEqual(MOBILE_WIDTH);
  await expectFormWidth(page, "Crear mi consultorio");
});
