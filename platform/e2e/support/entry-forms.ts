import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const SHORT_PASSWORD_ERROR =
  "Tu contraseña debe tener al menos 8 caracteres.";
export const LONG_PASSWORD_ERROR =
  "Tu contraseña puede tener hasta 128 caracteres.";
export const TOO_MANY_ATTEMPTS_ERROR =
  "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";

const LONGEST_VALID_PASSWORD_LENGTH = 128;
export const TOO_LONG_PASSWORD = "a".repeat(LONGEST_VALID_PASSWORD_LENGTH + 1);

export const passwordField = (page: Page) =>
  page.getByLabel("Contraseña", { exact: true });

// El anunciador de rutas de Next también es un `role="alert"`, vacío.
export const alertWith = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

export function trackCalls(page: Page, fragment: string): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(fragment)) calls.push(request.url());
  });
  return calls;
}

export async function holdRequests(
  page: Page,
  urlPattern: string,
): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(urlPattern, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

async function visibleBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("El elemento no tiene caja visible");
  return box;
}

export async function expectBelow(error: Locator, field: Locator) {
  const fieldBox = await visibleBox(field);
  const errorBox = await visibleBox(error);
  expect(errorBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
}

export async function expectFocusReturnsOnRepeatedError(
  submit: Locator,
  field: Locator,
) {
  await expect(field).toBeFocused();
  await submit.focus();
  await submit.click();
  await expect(field).toBeFocused();
}

export async function expectDescribedBy(field: Locator, error: Locator) {
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute(
    "aria-describedby",
    (await error.getAttribute("id")) ?? "",
  );
}
