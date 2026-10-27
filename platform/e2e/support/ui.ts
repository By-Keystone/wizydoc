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
  await page.getByLabel("Apellido").fill(params.lastName);
  await page.getByLabel("Correo electrónico").fill(params.email);
  await page.getByLabel("Celular").fill(params.phone);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(params.password ?? E2E_PASSWORD);

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

// Con una sola sede en total, `/select` redirige a su dashboard; con ninguna o con varias, se queda.
export const clinicDashboardUrl = (accountId: string) =>
  new RegExp(`/account/${accountId}/clinic/[^/]+/dashboard$`);

async function submitLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);

  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

export async function loginViaUi(
  page: Page,
  email: string,
  expectedUrl: string | RegExp,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await submitLoginForm(page, email, password);

  // `toHaveURL` reintenta solo: evita la carrera con el `router.push` de `login-form.tsx`.
  // El primer login tras arrancar `next dev` compila las rutas en caliente: con los 5 s por defecto falla bajo carga.
  await expect(page).toHaveURL(expectedUrl, { timeout: 20_000 });
}

// `/select` pasa por URLs intermedias según cuántas sedes tenga el usuario: con `callbackUrl` el destino no depende de eso.
export async function loginAndGoTo(
  page: Page,
  email: string,
  path: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(path)}`);
  await submitLoginForm(page, email, password);

  await expect(page).toHaveURL(path, { timeout: 20_000 });
}

export const ONBOARDING_ADDRESS = "Av. José Larco 812, of. 304, Miraflores";
export const ONBOARDING_SPECIALTY = "Dermatología";

export interface OnboardingDetails {
  name: string;
  address?: string;
  specialty?: string;
}

export async function fillOnboardingForm(
  page: Page,
  {
    name,
    address = ONBOARDING_ADDRESS,
    specialty = ONBOARDING_SPECIALTY,
  }: OnboardingDetails,
): Promise<void> {
  await page.getByLabel("Nombre del consultorio").fill(name);
  await page.getByLabel("Dirección", { exact: true }).fill(address);
  await page.getByLabel("Tu especialidad").fill(specialty);
}

export const anyClinicDashboardUrl =
  /\/account\/[^/]+\/clinic\/[^/]+\/dashboard$/;

export async function completeOnboardingViaUi(
  page: Page,
  details: OnboardingDetails,
): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding$/);

  await fillOnboardingForm(page, details);
  await page.getByRole("button", { name: "Crear mi consultorio" }).click();

  await expect(page).toHaveURL(anyClinicDashboardUrl, { timeout: 20_000 });
}
