import type { Page } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import {
  alertWith,
  expectBelow,
  expectDescribedBy,
  expectFocusReturnsOnRepeatedError,
  holdRequests,
  LONG_PASSWORD_ERROR,
  passwordField,
  SHORT_PASSWORD_ERROR,
  TOO_LONG_PASSWORD,
  TOO_MANY_ATTEMPTS_ERROR,
  trackCalls,
} from "../../support/entry-forms";
import { expect, test } from "../../support/test";
import { registerViaUi } from "../../support/ui";
import {
  createConfirmedUser,
  E2E_PASSWORD,
  uniqueEmail,
} from "../../support/users";

// Textos y errores del registro y de «Revisa tu correo».

const SIGN_UP_URL = "**/api/auth/sign-up/email";
const REGISTRATION_FAILED =
  "No pudimos crear tu cuenta. Revisa tu conexión y vuelve a intentarlo.";

const nameField = (page: Page) => page.getByLabel("Nombre", { exact: true });
const lastNameField = (page: Page) =>
  page.getByLabel("Apellido", { exact: true });
const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const phoneField = (page: Page) => page.getByLabel("Celular", { exact: true });
const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Crear cuenta", exact: true });

async function fillRegistration(
  page: Page,
  { email = uniqueEmail("registro"), password = E2E_PASSWORD } = {},
) {
  await nameField(page).fill("Ana");
  await lastNameField(page).fill("García");
  await emailField(page).fill(email);
  await phoneField(page).fill("999 888 777");
  await passwordField(page).fill(password);
}

test("el celular arranca en +51 y se guarda con el código del país", async ({
  page,
}) => {
  await page.goto("/register");
  await expect(page.getByLabel("Código de país")).toHaveValue("+51");

  const email = uniqueEmail("celular");
  await registerViaUi(page, {
    name: "Ana",
    lastName: "García",
    phone: "999 888 777",
    email,
  });

  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  expect(user?.phone).toBe("+51999888777");
});

test("el registro vacío muestra un error por campo y enfoca el primero; con lo demás completo, enfoca el celular", async ({
  page,
}) => {
  const signUpCalls = trackCalls(page, "/api/auth/sign-up/email");
  await page.goto("/register");

  await submitButton(page).click();
  for (const message of [
    "Escribe tu nombre.",
    "Escribe tu apellido.",
    "Escribe tu correo.",
    "Escribe tu celular.",
    SHORT_PASSWORD_ERROR,
  ]) {
    await expect(alertWith(page, message)).toBeVisible();
  }
  await expect(nameField(page)).toBeFocused();

  await nameField(page).fill("Ana");
  await lastNameField(page).fill("García");
  await emailField(page).fill(uniqueEmail("incompleto"));
  await passwordField(page).fill(E2E_PASSWORD);
  await submitButton(page).click();
  await expect(alertWith(page, "Escribe tu celular.")).toBeVisible();
  await expect(phoneField(page)).toBeFocused();
  await expect(phoneField(page)).toHaveAttribute("aria-invalid", "true");

  expect(signUpCalls).toHaveLength(0);
});

for (const { situation, password, message } of [
  {
    situation: "corta",
    password: "1234567",
    message: SHORT_PASSWORD_ERROR,
  },
  {
    situation: "demasiado larga",
    password: TOO_LONG_PASSWORD,
    message: LONG_PASSWORD_ERROR,
  },
]) {
  test(`con la contraseña ${situation}, el error sale debajo del campo y no se envía nada`, async ({
    page,
  }) => {
    const signUpCalls = trackCalls(page, "/api/auth/sign-up/email");
    await page.goto("/register");
    await fillRegistration(page, { password });

    await submitButton(page).click();

    const passwordError = alertWith(page, message);
    await expect(passwordError).toBeVisible();
    await expectBelow(passwordError, passwordField(page));
    await expectDescribedBy(passwordField(page), passwordError);
    await expect(passwordField(page)).toBeFocused();
    expect(signUpCalls).toHaveLength(0);
  });
}

test.describe("respuestas del api traducidas", () => {
  test("INVALID_EMAIL va al campo del correo", async ({ page }) => {
    await page.route(SIGN_UP_URL, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "INVALID_EMAIL",
          message: "Invalid email",
        }),
      }),
    );
    await page.goto("/register");
    await fillRegistration(page);
    await submitButton(page).click();

    const emailError = alertWith(
      page,
      "Escribe un correo válido, por ejemplo ana@consultorio.com.",
    );
    await expect(emailError).toBeVisible();
    await expectBelow(emailError, emailField(page));
    await expect(emailField(page)).toBeFocused();
    await expect(page.getByText("Invalid email")).toHaveCount(0);
  });

  for (const { code, message } of [
    { code: "PASSWORD_TOO_SHORT", message: SHORT_PASSWORD_ERROR },
    { code: "PASSWORD_TOO_LONG", message: LONG_PASSWORD_ERROR },
  ]) {
    test(`${code} va al campo de la contraseña`, async ({ page }) => {
      await page.route(SIGN_UP_URL, (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code, message: "Password rejected" }),
        }),
      );
      await page.goto("/register");
      await fillRegistration(page);
      await submitButton(page).click();

      const passwordError = alertWith(page, message);
      await expect(passwordError).toBeVisible();
      await expectBelow(passwordError, passwordField(page));
      await expect(passwordField(page)).toBeFocused();
      await expect(page.getByText("Password rejected")).toHaveCount(0);
    });
  }

  test("un 429 va a la caja de error, en español", async ({ page }) => {
    await page.route(SIGN_UP_URL, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Too many requests. Please try again later.",
        }),
      }),
    );
    await page.goto("/register");
    await fillRegistration(page);
    await submitButton(page).click();

    await expect(alertWith(page, TOO_MANY_ATTEMPTS_ERROR)).toBeVisible();
    await expect(page.getByText("Too many requests")).toHaveCount(0);
    await expect(submitButton(page)).toBeEnabled();
  });

  test("sin red, la caja de error pide revisar la conexión", async ({
    page,
  }) => {
    await page.route(SIGN_UP_URL, (route) => route.abort());
    await page.goto("/register");
    await fillRegistration(page);
    await submitButton(page).click();

    await expect(alertWith(page, REGISTRATION_FAILED)).toBeVisible();
    await expect(submitButton(page)).toBeEnabled();
  });
});

test("un correo ya registrado llega a «Revisa tu correo» igual que uno nuevo", async ({
  page,
}) => {
  const existing = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "yaexiste",
  });

  await registerViaUi(page, {
    name: "Ana",
    lastName: "García",
    phone: "999888777",
    email: existing.email,
  });

  await expect(page).toHaveURL(/\/confirm-email$/);
});

test("mientras crea la cuenta, el botón queda deshabilitado con «Creando tu cuenta…»", async ({
  page,
}) => {
  const releaseSignUp = await holdRequests(page, SIGN_UP_URL);
  await page.goto("/register");
  await fillRegistration(page);
  await submitButton(page).click();

  const waitingButton = page.getByRole("button", {
    name: "Creando tu cuenta…",
    exact: true,
  });
  await expect(waitingButton).toBeVisible();
  await expect(waitingButton).toBeDisabled();

  releaseSignUp();
  await expect(page).toHaveURL(/\/confirm-email$/);
});

test("«Mostrar contraseña» cambia el tipo del campo sin borrar lo escrito", async ({
  page,
}) => {
  await page.goto("/register");
  await passwordField(page).fill("lo-que-escribi");

  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Mostrar contraseña", exact: true })
    .click();
  await expect(passwordField(page)).toHaveAttribute("type", "text");
  await expect(passwordField(page)).toHaveValue("lo-que-escribi");

  await page
    .getByRole("button", { name: "Ocultar contraseña", exact: true })
    .click();
  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await expect(passwordField(page)).toHaveValue("lo-que-escribi");
});

test("«Revisa tu correo» explica el siguiente paso y cierra con el enlace «Inicia sesión»", async ({
  page,
}) => {
  await page.goto("/confirm-email");

  await expect(
    page.getByRole("heading", { name: "Revisa tu correo" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Te enviamos un enlace para confirmar tu correo. Ábrelo para activar tu cuenta y seguir con la configuración. Si no lo ves, revisa la carpeta de spam.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("¿Ya lo confirmaste?")).toBeVisible();

  await page.getByRole("link", { name: "Inicia sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("el mismo error de campo dos veces devuelve el foco al campo", async ({
  page,
}) => {
  await page.goto("/register");
  await submitButton(page).click();
  await expect(alertWith(page, "Escribe tu nombre.")).toBeVisible();

  await expectFocusReturnsOnRepeatedError(submitButton(page), nameField(page));
});

test("tras crear la cuenta, el botón sigue deshabilitado hasta navegar y un segundo envío no repite la petición", async ({
  page,
}) => {
  const signUpCalls = trackCalls(page, "/api/auth/sign-up/email");
  const releaseNavigation = await holdRequests(page, "**/confirm-email*");
  await page.goto("/register");
  await fillRegistration(page);
  await submitButton(page).click();
  await page.waitForRequest(/\/confirm-email/);

  const waitingButton = page.getByRole("button", {
    name: "Creando tu cuenta…",
    exact: true,
  });
  await expect(waitingButton).toBeDisabled();
  await waitingButton.click({ force: true });
  await emailField(page).press("Enter");
  await expect(waitingButton).toBeDisabled();

  releaseNavigation();
  await expect(page).toHaveURL(/\/confirm-email$/);
  expect(signUpCalls).toHaveLength(1);
});
