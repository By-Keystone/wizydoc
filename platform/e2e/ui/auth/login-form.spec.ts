import type { Page } from "@playwright/test";
import { createApiContext, createOnboardedAdmin } from "../../support/accounts";
import {
  alertWith,
  expectFocusReturnsOnRepeatedError,
  holdRequests,
  passwordField,
  trackCalls,
} from "../../support/entry-forms";
import { expect, test } from "../../support/test";
import {
  createConfirmedUser,
  E2E_PASSWORD,
  signUp,
  uniqueEmail,
} from "../../support/users";

// Textos y errores del login.

const SIGN_IN_URL = "**/api/auth/sign-in/email";
const INVALID_EMAIL_ERROR =
  "Escribe un correo válido, por ejemplo ana@consultorio.com.";

const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Iniciar sesión", exact: true });

test("una contraseña incorrecta muestra el aviso en español en la caja de error, no el de Better Auth", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "credenciales",
  });
  await page.goto("/login");

  await emailField(page).fill(user.email);
  await passwordField(page).fill("Otra-Clave-2026");
  await submitButton(page).click();

  await expect(
    alertWith(page, "El correo o la contraseña no son correctos."),
  ).toBeVisible();
  await expect(page.getByText("Invalid email or password")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(passwordField(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(submitButton(page)).toBeEnabled();
});

test("un correo sin confirmar pide confirmarlo, en español", async ({
  page,
}) => {
  const email = uniqueEmail("sinconfirmar");
  await signUp(await createApiContext(), { email });
  await page.goto("/login");

  await emailField(page).fill(email);
  await passwordField(page).fill(E2E_PASSWORD);
  await submitButton(page).click();

  await expect(
    alertWith(
      page,
      "Primero confirma tu correo con el enlace que te enviamos al registrarte.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Email not verified")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test("sin red, el login avisa que revises la conexión y deja reintentar", async ({
  page,
}) => {
  await page.route(SIGN_IN_URL, (route) => route.abort());
  await page.goto("/login");

  await emailField(page).fill(uniqueEmail("sinred"));
  await passwordField(page).fill(E2E_PASSWORD);
  await submitButton(page).click();

  await expect(
    alertWith(
      page,
      "No pudimos iniciar sesión. Revisa tu conexión y vuelve a intentarlo.",
    ),
  ).toBeVisible();
  await expect(submitButton(page)).toBeEnabled();
});

test("el login vacío o incompleto muestra el error de cada campo, enfoca el primero con error y no envía nada", async ({
  page,
}) => {
  const signInCalls = trackCalls(page, "/api/auth/sign-in/email");
  await page.goto("/login");

  await submitButton(page).click();
  await expect(alertWith(page, "Escribe tu correo.")).toBeVisible();
  await expect(alertWith(page, "Escribe tu contraseña.")).toBeVisible();
  await expect(emailField(page)).toBeFocused();
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(passwordField(page)).toHaveAttribute("aria-invalid", "true");

  await emailField(page).fill("ana@consultorio");
  await submitButton(page).click();
  await expect(alertWith(page, INVALID_EMAIL_ERROR)).toBeVisible();
  await expect(emailField(page)).toBeFocused();

  await emailField(page).fill("ana@consultorio.com");
  await submitButton(page).click();
  await expect(alertWith(page, INVALID_EMAIL_ERROR)).toHaveCount(0);
  await expect(alertWith(page, "Escribe tu contraseña.")).toBeVisible();
  await expect(passwordField(page)).toBeFocused();

  expect(signInCalls).toHaveLength(0);
});

test("mientras inicia sesión, el botón queda deshabilitado con «Iniciando sesión…»", async ({
  page,
}) => {
  const releaseSignIn = await holdRequests(page, SIGN_IN_URL);
  await page.goto("/login");

  await emailField(page).fill(uniqueEmail("espera"));
  await passwordField(page).fill(E2E_PASSWORD);
  await submitButton(page).click();

  const waitingButton = page.getByRole("button", {
    name: "Iniciando sesión…",
    exact: true,
  });
  await expect(waitingButton).toBeVisible();
  await expect(waitingButton).toBeDisabled();

  releaseSignIn();
  await expect(submitButton(page)).toBeEnabled();
});

test("«Mostrar contraseña» cambia el tipo del campo sin borrar lo escrito", async ({
  page,
}) => {
  await page.goto("/login");
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

test("el mismo error de campo dos veces devuelve el foco al campo", async ({
  page,
}) => {
  await page.goto("/login");
  await submitButton(page).click();
  await expect(alertWith(page, "Escribe tu correo.")).toBeVisible();

  await expectFocusReturnsOnRepeatedError(submitButton(page), emailField(page));
});

test("tras un inicio de sesión correcto, el botón sigue deshabilitado hasta navegar y un segundo envío no repite la petición", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "doble-envio" });
  const signInCalls = trackCalls(page, "/api/auth/sign-in/email");
  const releaseNavigation = await holdRequests(page, "**/account/*/select*");
  await page.goto("/login");

  await emailField(page).fill(admin.email);
  await passwordField(page).fill(E2E_PASSWORD);
  await submitButton(page).click();
  await page.waitForRequest(/\/account\/[^/]+\/select/);

  const waitingButton = page.getByRole("button", {
    name: "Iniciando sesión…",
    exact: true,
  });
  await expect(waitingButton).toBeDisabled();
  await waitingButton.click({ force: true });
  await emailField(page).press("Enter");
  await expect(waitingButton).toBeDisabled();

  releaseNavigation();
  await expect(page).toHaveURL(/\/account\/[^/]+\/select$/);
  expect(signInCalls).toHaveLength(1);
});
