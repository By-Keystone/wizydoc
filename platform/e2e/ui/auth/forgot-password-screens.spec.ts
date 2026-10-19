import type { Page } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import {
  createConfirmedUser,
  E2E_PASSWORD,
  uniqueEmail,
} from "../../support/users";
import {
  readResetLink,
  requestResetViaPlatform,
} from "../../support/password-reset";

// docs/features/forgot-password/plan.md — CA-5, CA-6, CA-19, CA-21, CA-25, CA-26, CA-34, CA-35, CA-39 a CA-44 y CA-46.

const FORGOT_TOO_MANY =
  "Hiciste varios pedidos seguidos. Espera 10 minutos y vuelve a intentarlo.";
const RESET_TOO_MANY =
  "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";
const SEND_FAILED =
  "No pudimos enviar el enlace. Revisa tu conexión y vuelve a intentarlo.";
const SAVE_FAILED = "No pudimos guardar tu contraseña. Vuelve a intentarlo.";
const SHORT_ERROR = "Tu contraseña nueva debe tener al menos 8 caracteres.";
const LONG_ERROR = "Tu contraseña nueva puede tener hasta 128 caracteres.";
const RESET_NOTICE = "Listo, ya puedes iniciar sesión con tu contraseña nueva.";
const FAKE_LINK_PATH = "/reset-password#token=AAAAAAAAAAAAAAAAAAAAAAAA";
const LONG_EMAIL =
  "recepcion.consultorio.pediatrico.san.borja@clinicasanmartindeporres.com.pe";

const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Enviar enlace", exact: true });
const passwordField = (page: Page) =>
  page.getByLabel("Contraseña nueva", { exact: true });
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Guardar contraseña", exact: true });
const alertWith = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

function trackCalls(page: Page, fragment: string): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(fragment)) calls.push(request.url());
  });
  return calls;
}

test("CA-5 y CA-41: un correo vacío o incompleto muestra su error, enfoca el campo y no hace ninguna petición", async ({
  page,
}) => {
  const calls = trackCalls(page, "request-password-reset");
  await page.goto("/forgot-password");

  await sendButton(page).click();
  const emptyError = alertWith(page, "Escribe tu correo.");
  await expect(emptyError).toBeVisible();
  await expect(emailField(page)).toBeFocused();
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(emailField(page)).toHaveClass(/border-red-400/);
  await expect(emailField(page)).toHaveAttribute(
    "aria-describedby",
    (await emptyError.getAttribute("id")) ?? "",
  );

  await emailField(page).fill("ana.lopez@consultorio");
  await sendButton(page).click();
  await expect(
    alertWith(
      page,
      "Escribe un correo válido, por ejemplo ana@consultorio.com.",
    ),
  ).toBeVisible();
  await expect(emailField(page)).toBeFocused();
  await expect(emailField(page)).toHaveClass(/border-red-400/);

  expect(calls).toEqual([]);
});

test("CA-6 y CA-42: «Pide otro enlace» vuelve al formulario con el correo y «Volver a iniciar sesión» lleva a /login; el foco queda en el título", async ({
  page,
}) => {
  const email = uniqueEmail("otro-enlace");
  await page.goto("/forgot-password");
  await emailField(page).fill(email);
  await sendButton(page).click();

  const title = page.getByRole("heading", {
    name: "Revisa tu correo",
    exact: true,
  });
  await expect(title).toBeFocused();

  await page
    .getByRole("button", { name: "Pide otro enlace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Recupera tu contraseña", exact: true }),
  ).toBeVisible();
  await expect(emailField(page)).toHaveValue(email);
  await expect(emailField(page)).toBeFocused();

  await page
    .getByRole("link", { name: "Volver a iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});

test("CA-19 y CA-41: 7 y 129 caracteres muestran su límite sin petición, con el campo enfocado, y 8 se guardan", async ({
  page,
}) => {
  const calls = trackCalls(page, "/api/auth/reset-password");
  await page.goto(FAKE_LINK_PATH);

  await passwordField(page).fill("1234567");
  await saveButton(page).click();
  const shortError = alertWith(page, SHORT_ERROR);
  await expect(shortError).toBeVisible();
  await expect(passwordField(page)).toBeFocused();
  await expect(passwordField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(passwordField(page)).toHaveAttribute(
    "aria-describedby",
    (await shortError.getAttribute("id")) ?? "",
  );

  await passwordField(page).fill("a".repeat(129));
  await saveButton(page).click();
  await expect(alertWith(page, LONG_ERROR)).toBeVisible();
  expect(calls).toEqual([]);
});

test("CA-19: con exactamente 8 caracteres se guarda", async ({ page }) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ocho",
  });
  await requestResetViaPlatform(await createApiContext(), user.email);

  await page.goto(await readResetLink(user.email));
  await passwordField(page).fill("12345678");
  await saveButton(page).click();

  await expect(page).toHaveURL(/\/login\?reset=ok$/);
});

test("CA-21 y CA-44: «Mostrar» y «Ocultar» alternan el campo sin borrar lo escrito y el orden de tabulación es contraseña, Mostrar, Guardar", async ({
  page,
}) => {
  await page.goto(FAKE_LINK_PATH);
  await passwordField(page).fill("lo-que-escribi");

  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Mostrar contraseña nueva", exact: true })
    .click();
  await expect(passwordField(page)).toHaveAttribute("type", "text");
  await expect(passwordField(page)).toHaveValue("lo-que-escribi");

  await page
    .getByRole("button", { name: "Ocultar contraseña nueva", exact: true })
    .click();
  await expect(passwordField(page)).toHaveAttribute("type", "password");
  await expect(passwordField(page)).toHaveValue("lo-que-escribi");

  await passwordField(page).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Mostrar contraseña nueva", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(saveButton(page)).toBeFocused();
});

test("CA-25 y CA-26: el login sólo muestra el aviso con ?reset=ok y su enlace lleva a /forgot-password sin arrastrar el correo", async ({
  page,
}) => {
  for (const path of ["/login", "/login?reset=otra-cosa"]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Iniciar sesión", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(RESET_NOTICE)).toHaveCount(0);
  }

  await page.goto("/login?reset=ok");
  await expect(
    page.getByRole("status").getByText(RESET_NOTICE, { exact: true }),
  ).toBeVisible();

  await page.goto("/login");
  const typed = uniqueEmail("arrastra");
  await page.getByLabel("Correo electrónico").fill(typed);
  await page
    .getByRole("link", { name: "¿Olvidaste tu contraseña?", exact: true })
    .click();

  await expect(page).toHaveURL(`${PLATFORM_BASE_URL}/forgot-password`);
  await expect(emailField(page)).toHaveValue("");
});

test("CA-44: en el login el orden es correo, contraseña, «¿Olvidaste tu contraseña?», «Iniciar sesión», «Regístrate gratis» y Enter inicia sesión", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "teclado",
  });
  await page.goto("/login");

  await page.getByLabel("Correo electrónico").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "¿Olvidaste tu contraseña?", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Iniciar sesión", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Regístrate gratis", exact: true }),
  ).toBeFocused();

  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("CA-34 y CA-43: un 429 en cada pantalla muestra su aviso en español, con role alert, sin inglés y con el formulario disponible", async ({
  page,
}) => {
  const tooMany = {
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({
      message: "Too many requests. Please try again later.",
    }),
  };

  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill(tooMany),
  );
  await page.goto("/forgot-password");
  const typed = uniqueEmail("limite");
  await emailField(page).fill(typed);
  await sendButton(page).click();
  await expect(alertWith(page, FORGOT_TOO_MANY)).toBeVisible();
  await expect(page.getByText("Too many requests")).toHaveCount(0);
  await expect(emailField(page)).toHaveValue(typed);
  await expect(sendButton(page)).toBeEnabled();

  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill(tooMany),
  );
  await page.goto(FAKE_LINK_PATH);
  await passwordField(page).fill("Clave-Escrita-2026");
  await saveButton(page).click();
  await expect(alertWith(page, RESET_TOO_MANY)).toBeVisible();
  await expect(page.getByText("Too many requests")).toHaveCount(0);
  await expect(passwordField(page)).toHaveValue("Clave-Escrita-2026");
  await expect(saveButton(page)).toBeEnabled();
});

test("CA-35 y CA-43: sin red al pedir el enlace y un 500 al guardar muestran el aviso genérico con role alert", async ({
  page,
}) => {
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.abort(),
  );
  await page.goto("/forgot-password");
  await emailField(page).fill(uniqueEmail("sin-red"));
  await sendButton(page).click();
  await expect(alertWith(page, SEND_FAILED)).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();

  await page.route("**/api/auth/reset-password", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Internal error" }),
    }),
  );
  await page.goto(FAKE_LINK_PATH);
  await passwordField(page).fill("Clave-Escrita-2026");
  await saveButton(page).click();
  await expect(alertWith(page, SAVE_FAILED)).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();
});

test("CA-46: las pantallas abren sin sesión, tienen noindex y /reset-password no envía referrer", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Recupera tu contraseña", exact: true }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  await page.goto(FAKE_LINK_PATH);
  await expect(passwordField(page)).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
});

test("el login no sale del dominio con un callbackUrl que empieza por /\\", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "redireccion",
  });
  await page.route("**://evil.com/**", (route) => route.abort());
  await page.goto(`/login?callbackUrl=${encodeURIComponent("/\\evil.com")}`);

  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();

  await expect(page).not.toHaveURL(/\/login/);
  expect(new URL(page.url()).origin).toBe(PLATFORM_BASE_URL);
});

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 780 } });

  const horizontalExtent = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth);

  async function expectHeight(
    page: Page,
    role: "link" | "button",
    name: string,
  ) {
    const box = await page
      .getByRole(role, { name, exact: true })
      .first()
      .boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  }

  async function expectFullWidth(page: Page, name: string, container: string) {
    const button = await page
      .getByRole("button", { name, exact: true })
      .or(page.getByRole("link", { name, exact: true }))
      .first()
      .boundingBox();
    const parent = await page.locator(container).first().boundingBox();
    expect(Math.abs((button?.width ?? 0) - (parent?.width ?? -1))).toBeLessThan(
      2,
    );
  }

  test("CA-39 y CA-40: las cinco pantallas no se desplazan hacia los lados y sus botones y enlaces miden lo debido", async ({
    page,
  }) => {
    await page.goto("/login?reset=ok");
    await expect(page.getByText(RESET_NOTICE)).toBeVisible();
    expect(await horizontalExtent(page)).toBeLessThanOrEqual(375);
    await expectHeight(page, "link", "¿Olvidaste tu contraseña?");
    await expectFullWidth(page, "Iniciar sesión", "form");

    await page.goto("/forgot-password");
    await sendButton(page).click();
    await expect(alertWith(page, "Escribe tu correo.")).toBeVisible();
    expect(await horizontalExtent(page)).toBeLessThanOrEqual(375);
    await expectHeight(page, "link", "Volver a iniciar sesión");
    await expectFullWidth(page, "Enviar enlace", "form");

    await emailField(page).fill(LONG_EMAIL);
    await sendButton(page).click();
    await expect(
      page.getByRole("heading", { name: "Revisa tu correo", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(LONG_EMAIL)).toBeVisible();
    expect(await horizontalExtent(page)).toBeLessThanOrEqual(375);
    await expectHeight(page, "link", "Volver a iniciar sesión");
    await expectHeight(page, "button", "Pide otro enlace");
    const card = await page
      .getByRole("heading", { level: 1 })
      .locator("..")
      .boundingBox();
    const back = await page
      .getByRole("link", { name: "Volver a iniciar sesión", exact: true })
      .boundingBox();
    expect(back?.width ?? 0).toBeGreaterThan((card?.width ?? 0) - 70);

    await page.goto(FAKE_LINK_PATH);
    await passwordField(page).fill("1234567");
    await saveButton(page).click();
    await expect(alertWith(page, SHORT_ERROR)).toBeVisible();
    expect(await horizontalExtent(page)).toBeLessThanOrEqual(375);
    await expectFullWidth(page, "Guardar contraseña", "form");

    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", {
        name: "Este enlace ya no sirve",
        exact: true,
      }),
    ).toBeVisible();
    expect(await horizontalExtent(page)).toBeLessThanOrEqual(375);
    await expectHeight(page, "link", "Pedir otro enlace");
    await expectHeight(page, "link", "Volver a iniciar sesión");
  });
});
