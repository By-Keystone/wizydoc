import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { withoutDevCookieEcho } from "../support/dev-cookie-echo";
import { FAKE_BACKEND_API_KEY, FAKE_BACKEND_URL } from "../support/env";
import { readServerlessPlatformLog } from "../support/server-logs";
import { expect, test } from "../support/test";
import { uniqueEmail } from "../support/users";

const SIGN_UP_PROGRESS_COOKIE = "sign_up_progress";
const SESSION_COOKIES = [
  "session_id_token",
  "session_access_token",
  "session_refresh_token",
];
const CORRECT_CODE = "482913";
const PASSWORD = "Consulta-Miraflores-2026";
const SESSION_LIFETIME_SECONDS = 3600;
const REFRESH_LIFETIME_SECONDS = 30 * 24 * 3600;
const COOKIE_EXPIRY_TOLERANCE_SECONDS = 120;
const PHONE_WIDTH = 375;
const LONG_EMAIL_LOCAL_PART = "lucia.paredes.consultorio.de.medicina.general";
const TOO_SHORT_ERROR = "La contraseña debe tener al menos 8 caracteres";
const EDGE_SPACE_ERROR =
  "La contraseña no puede empezar ni terminar con un espacio, ni tener saltos de línea";
const ACCOUNT_CREATED_NOTICE =
  "Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña.";
const CONFIRM_ERROR = "No pudimos crear tu cuenta. Intenta de nuevo.";

interface RecordedRequest {
  path: string;
  email: string;
  verificationToken?: string;
  bodyKeys?: string[];
  session?: {
    idToken: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

async function watchForConfirmError(page: Page) {
  let wasShown = false;
  await page.exposeFunction("reportConfirmError", () => {
    wasShown = true;
  });
  await page.addInitScript((message) => {
    new MutationObserver(() => {
      if (document.body?.textContent?.includes(message)) {
        (
          window as unknown as { reportConfirmError(): void }
        ).reportConfirmError();
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, CONFIRM_ERROR);
  return () => wasShown;
}

const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const codeField = (page: Page) =>
  page.getByLabel("Código de 6 dígitos", { exact: true });
const passwordField = (page: Page) =>
  page.getByLabel("Contraseña", { exact: true });
const passwordHeading = (page: Page) =>
  page.getByRole("heading", { name: "Crea tu contraseña" });
const createAccountButton = (page: Page) =>
  page.getByRole("button", { name: "Crear cuenta", exact: true });

async function requestsFor(
  request: APIRequestContext,
  email: string,
  path: string,
): Promise<RecordedRequest[]> {
  const response = await request.get(
    `${FAKE_BACKEND_URL}/__requests?email=${encodeURIComponent(email)}`,
  );
  const recorded: RecordedRequest[] = await response.json();
  return recorded.filter((entry) => entry.path === path);
}

const confirmRequestsFor = (request: APIRequestContext, email: string) =>
  requestsFor(request, email, "/api/auth/sign-up/confirm");

async function reachPasswordStep(page: Page, email: string) {
  await page.goto("/register");
  await emailField(page).fill(email);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await codeField(page).pressSequentially(CORRECT_CODE);
  await expect(passwordHeading(page)).toBeVisible();
}

async function cookieNamed(context: BrowserContext, name: string) {
  return (await context.cookies()).find((cookie) => cookie.name === name);
}

async function replaceVerificationToken(
  context: BrowserContext,
  verificationToken: string,
) {
  const cookie = await cookieNamed(context, SIGN_UP_PROGRESS_COOKIE);
  if (!cookie) throw new Error("No hay cookie sign_up_progress");
  const progress = JSON.parse(decodeURIComponent(cookie.value));
  await context.addCookies([
    {
      ...cookie,
      value: encodeURIComponent(
        JSON.stringify({ ...progress, verificationToken }),
      ),
    },
  ]);
}

test("con serverless /confirm-email responde 307 hacia /register", async ({
  request,
}) => {
  const response = await request.get("/confirm-email", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(
    new URL(response.headers().location, "http://localhost").pathname,
  ).toBe("/register");
});

test("tras verificar el código la página muestra «Crea tu contraseña» en /register y recargar sigue ahí", async ({
  page,
}) => {
  await reachPasswordStep(page, uniqueEmail("contrasena"));

  expect(new URL(page.url()).pathname).toBe("/register");
  await expect(passwordField(page)).toBeFocused();

  await page.reload();

  await expect(passwordHeading(page)).toBeVisible();
});

test("con 200 el backend recibe sólo email, password y verificationToken, quedan las tres cookies de la sesión, se borra el avance y llega a /onboarding", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail("exito");
  const wasConfirmErrorShown = await watchForConfirmError(page);
  await reachPasswordStep(page, email);
  expect(new URL(page.url()).pathname).toBe("/register");

  await passwordField(page).fill(PASSWORD);
  await createAccountButton(page).click();

  await page.waitForURL(/\/(onboarding|login)/);
  expect(wasConfirmErrorShown()).toBe(false);
  const [confirmation] = await confirmRequestsFor(request, email);
  expect(await confirmRequestsFor(request, email)).toHaveLength(1);
  expect(confirmation.bodyKeys).toEqual([
    "email",
    "password",
    "verificationToken",
  ]);
  const [verification] = await requestsFor(
    request,
    email,
    "/api/auth/sign-up/code/verify",
  );
  expect(confirmation.verificationToken).toBe(verification.verificationToken);

  const session = confirmation.session;
  if (!session) throw new Error("El backend no dio una sesión");
  const nowSeconds = Date.now() / 1000;
  const expectations = [
    ["session_id_token", session.idToken, SESSION_LIFETIME_SECONDS],
    ["session_access_token", session.accessToken, SESSION_LIFETIME_SECONDS],
    ["session_refresh_token", session.refreshToken, REFRESH_LIFETIME_SECONDS],
  ] as const;
  for (const [name, value, lifetimeSeconds] of expectations) {
    const cookie = await cookieNamed(context, name);
    expect(cookie?.value).toBe(value);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    expect(
      Math.abs((cookie?.expires ?? 0) - (nowSeconds + lifetimeSeconds)),
    ).toBeLessThan(COOKIE_EXPIRY_TOLERANCE_SECONDS);
  }
  expect(await cookieNamed(context, SIGN_UP_PROGRESS_COOKIE)).toBeUndefined();
});

test("con 204 llega a /login?registered=ok con el aviso, sin cookies de sesión ni avance", async ({
  page,
  context,
}) => {
  const wasConfirmErrorShown = await watchForConfirmError(page);
  await reachPasswordStep(page, uniqueEmail("sinsesion"));

  await passwordField(page).fill(PASSWORD);
  await createAccountButton(page).click();

  await expect(page).toHaveURL(/\/login\?registered=ok$/);
  expect(wasConfirmErrorShown()).toBe(false);
  await expect(page.getByRole("status")).toContainText(ACCOUNT_CREATED_NOTICE);
  for (const name of SESSION_COOKIES) {
    expect(await cookieNamed(context, name)).toBeUndefined();
  }
  expect(await cookieNamed(context, SIGN_UP_PROGRESS_COOKIE)).toBeUndefined();
});

test("el login sin ?registered=ok no muestra el aviso", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText(ACCOUNT_CREATED_NOTICE)).toHaveCount(0);
});

test("con la verificación vencida se ve la tarjeta y «Pedir un código nuevo» muestra el correo escrito con el foco", async ({
  page,
  context,
  request,
}) => {
  const email = uniqueEmail("vencida");
  await reachPasswordStep(page, email);
  await replaceVerificationToken(context, "token-que-ya-no-sirve");

  await passwordField(page).fill(PASSWORD);
  await createAccountButton(page).click();

  const title = page.getByRole("heading", { name: "Tu verificación venció" });
  await expect(title).toBeFocused();

  await page.getByRole("button", { name: "Pedir un código nuevo" }).click();

  await expect(emailField(page)).toHaveValue(email);
  await expect(emailField(page)).toBeFocused();

  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Revisa tu correo" }),
  ).toBeVisible();
  const cookie = await cookieNamed(context, SIGN_UP_PROGRESS_COOKIE);
  expect(
    JSON.parse(decodeURIComponent(cookie?.value ?? "{}")),
  ).not.toHaveProperty("verificationToken");
  expect(
    await requestsFor(request, email, "/api/auth/sign-up/code"),
  ).toHaveLength(2);
});

test("con 500 muestra «No pudimos crear tu cuenta» y conserva lo escrito", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("caido");
  await page.goto("/register");
  await context.addCookies([
    {
      name: SIGN_UP_PROGRESS_COOKIE,
      value: encodeURIComponent(
        JSON.stringify({
          email,
          codeRequestedAt: Date.now(),
          verificationToken: "token-de-prueba",
        }),
      ),
      url: new URL("/register", page.url()).toString(),
      httpOnly: true,
    },
  ]);
  await page.reload();
  await expect(passwordHeading(page)).toBeVisible();

  await passwordField(page).fill(PASSWORD);
  await createAccountButton(page).click();

  await expect(
    page.getByRole("alert").filter({ hasText: CONFIRM_ERROR }),
  ).toBeVisible();
  await expect(passwordField(page)).toHaveValue(PASSWORD);
});

for (const { password, message, label } of [
  { password: "lucia26", message: TOO_SHORT_ERROR, label: "de 7 caracteres" },
  {
    password: " Consulta2026",
    message: EDGE_SPACE_ERROR,
    label: "que empieza con un espacio",
  },
]) {
  test(`una contraseña ${label} muestra su error sin llamar al backend`, async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("corta");
    await reachPasswordStep(page, email);

    await passwordField(page).fill(password);
    await createAccountButton(page).click();

    await expect(page.getByText(message)).toBeVisible();
    await expect(passwordField(page)).toBeFocused();
    expect(await confirmRequestsFor(request, email)).toEqual([]);
  });
}

test("ni la contraseña, ni el código, ni los tokens ni la clave aparecen en lo que recibe el navegador ni en el log de platform", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("privacidad-final");
  const receivedByBrowser: string[] = [];
  const readingResponses: Promise<void>[] = [];
  page.on("response", (response) => {
    readingResponses.push(
      (async () => {
        const { "set-cookie": setCookie = "", ...visibleHeaders } =
          await response.allHeaders();
        const otherCookies = setCookie
          .split("\n")
          .filter(
            (line) =>
              ![SIGN_UP_PROGRESS_COOKIE, ...SESSION_COOKIES].some((name) =>
                line.startsWith(`${name}=`),
              ),
          );
        receivedByBrowser.push(
          JSON.stringify({ ...visibleHeaders, "set-cookie": otherCookies }),
        );
        receivedByBrowser.push(
          withoutDevCookieEcho(await response.text().catch(() => ""), [
            SIGN_UP_PROGRESS_COOKIE,
            ...SESSION_COOKIES,
          ]),
        );
      })(),
    );
  });

  await reachPasswordStep(page, email);
  await passwordField(page).fill(PASSWORD);
  await createAccountButton(page).click();
  await page.waitForURL(/\/(onboarding|login)/);
  await page.waitForLoadState("networkidle");
  await Promise.all(readingResponses);

  const [confirmation] = await confirmRequestsFor(request, email);
  if (!confirmation.session) throw new Error("El backend no dio una sesión");
  const secrets = [
    PASSWORD,
    confirmation.verificationToken ?? "",
    confirmation.session.idToken,
    confirmation.session.accessToken,
    confirmation.session.refreshToken,
    FAKE_BACKEND_API_KEY,
  ];
  for (const secret of secrets) {
    expect(receivedByBrowser.some((body) => body.includes(secret))).toBe(false);
  }

  const log = readServerlessPlatformLog();
  for (const secret of secrets) expect(log).not.toContain(secret);
  expect(log).not.toMatch(/(?<!\d)482913(?!\d)/);
});

test("a 375 px, con un correo largo, los tres pasos no tienen desplazamiento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: PHONE_WIDTH, height: 800 });
  const longEmail = `${LONG_EMAIL_LOCAL_PART}.${Date.now()}@clinica-de-especialidades-medicas.com.pe`;
  const hasNoHorizontalScroll = () =>
    page.evaluate(
      (width) => document.documentElement.scrollWidth <= width,
      PHONE_WIDTH,
    );

  await page.goto("/register");
  expect(await hasNoHorizontalScroll()).toBe(true);

  await emailField(page).fill(longEmail);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(codeField(page)).toBeVisible();
  expect(await hasNoHorizontalScroll()).toBe(true);

  await codeField(page).pressSequentially(CORRECT_CODE);
  await expect(passwordHeading(page)).toBeVisible();
  expect(await hasNoHorizontalScroll()).toBe(true);
});
