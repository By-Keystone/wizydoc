import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { extractLink, readLatestEmailTo } from "./email";
import { E2E_PASSWORD } from "./users";

export interface RegisterViaUiParams {
  name: string;
  lastName: string;
  phone: string;
  email: string;
  password?: string;
}

export async function registerViaUi(
  page: Page,
  params: RegisterViaUiParams,
): Promise<void> {
  await page.goto("/register");

  await page.getByLabel("Nombre").fill(params.name);
  // Bug de accesibilidad: el label "Apellido" referencia `id="lastname"`, no el `id="lastName"` real.
  await page.locator('input[name="lastName"]').fill(params.lastName);
  await page.getByLabel("Correo electrónico").fill(params.email);
  await page.getByLabel("Celular").fill(params.phone);
  await page.getByLabel("Contraseña").fill(params.password ?? E2E_PASSWORD);

  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/confirm-email$/);
}

// `autoSignInAfterVerification` deja la sesión iniciada tras confirmar.
export async function confirmEmailViaLink(
  page: Page,
  email: string,
): Promise<void> {
  await expect
    .poll(() => readLatestEmailTo(email)?.subject)
    .toBe("Confirma tu correo en WizyDoc");

  const verificationEmail = readLatestEmailTo(email);
  const verificationLink = extractLink(
    verificationEmail!.html,
    "/api/auth/verify-email",
  );

  await page.goto(verificationLink);
}

export async function loginViaUi(
  page: Page,
  email: string,
  expectedUrl: string | RegExp,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto("/login");

  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);

  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  // `toHaveURL` reintenta solo: evita la carrera con el `router.push` de `login-form.tsx`.
  await expect(page).toHaveURL(expectedUrl);
}

export async function completeOnboardingViaUi(
  page: Page,
  accountName: string,
): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Nombre de la cuenta").fill(accountName);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page).toHaveURL(/\/account\/[^/]+\/select$/);
}
