import type { APIRequestContext, Page } from "@playwright/test";
import { FAKE_BACKEND_API_KEY, FAKE_BACKEND_URL } from "../support/env";
import { expect, test } from "../support/test";
import { uniqueEmail } from "../support/users";

const SIGN_UP_PROGRESS_COOKIE = "sign_up_progress";
const ONE_HOUR_SECONDS = 3600;
const TOO_MANY_ATTEMPTS_ERROR =
  "Demasiados intentos. Intenta de nuevo en unos minutos.";
const REQUEST_CODE_ERROR = "No pudimos enviarte el código. Intenta de nuevo.";
const GATEWAY_FORWARDED_IP = "203.0.113.40";

interface RecordedRequest {
  path: string;
  email: string;
  realIp?: string;
  userAgent?: string;
}

const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const continueButton = (page: Page) =>
  page.getByRole("button", { name: "Continuar", exact: true });

async function requestsFor(
  request: APIRequestContext,
  email: string,
): Promise<RecordedRequest[]> {
  const response = await request.get(
    `${FAKE_BACKEND_URL}/__requests?email=${encodeURIComponent(email)}`,
  );
  return response.json();
}

test("«Continuar» pide el código una sola vez, con el correo en minúsculas, y la página sigue en el correo", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("pedido");
  await page.goto("/register");

  await emailField(page).fill(email.toUpperCase());
  await continueButton(page).click();

  await expect
    .poll(async () => (await requestsFor(request, email)).length)
    .toBe(1);
  await expect(continueButton(page)).toBeEnabled();
  expect(await requestsFor(request, email)).toHaveLength(1);
  expect(new URL(page.url()).pathname).toBe("/register");
  await expect(
    page.getByRole("heading", { name: "Crea tu cuenta" }),
  ).toBeVisible();
});

test("la cookie de avance es HttpOnly, de /register, Lax y vence a la hora", async ({
  page,
  context,
}) => {
  await page.goto("/register");
  await emailField(page).fill(uniqueEmail("cookie"));
  const before = Date.now() / 1000;
  await continueButton(page).click();

  await expect
    .poll(async () =>
      (await context.cookies()).some(
        (cookie) => cookie.name === SIGN_UP_PROGRESS_COOKIE,
      ),
    )
    .toBe(true);
  const cookie = (await context.cookies()).find(
    (candidate) => candidate.name === SIGN_UP_PROGRESS_COOKIE,
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/register");
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.expires).toBeGreaterThan(before + ONE_HOUR_SECONDS - 60);
  expect(cookie?.expires).toBeLessThan(before + ONE_HOUR_SECONDS + 60);
});

test.describe("con la IP del cliente en X-Real-IP", () => {
  test.use({ extraHTTPHeaders: { "X-Real-IP": GATEWAY_FORWARDED_IP } });

  test("el backend recibe x-real-ip, el user-agent del navegador y la clave, y el navegador nunca ve la clave ni llama al backend", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("cabeceras");
    const browserUrls: string[] = [];
    const receivedByBrowser: string[] = [];
    page.on("request", (browserRequest) =>
      browserUrls.push(browserRequest.url()),
    );
    const readingResponses: Promise<void>[] = [];
    page.on("response", (response) => {
      readingResponses.push(
        (async () => {
          const headers = await response.allHeaders();
          const { "set-cookie": _cookies, ...visibleHeaders } = headers;
          receivedByBrowser.push(JSON.stringify(visibleHeaders));
          receivedByBrowser.push(await response.text().catch(() => ""));
        })(),
      );
    });

    await page.goto("/register");
    await emailField(page).fill(email);
    const actionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/register",
    );
    await continueButton(page).click();
    await actionResponse;
    await expect
      .poll(async () => (await requestsFor(request, email)).length)
      .toBe(1);
    await page.waitForLoadState("networkidle");
    await Promise.all(readingResponses);

    const [recorded] = await requestsFor(request, email);
    expect(recorded.realIp).toBe(GATEWAY_FORWARDED_IP);
    expect(recorded.userAgent).toBe(
      await page.evaluate(() => navigator.userAgent),
    );
    expect(browserUrls.some((url) => url.startsWith(FAKE_BACKEND_URL))).toBe(
      false,
    );
    expect(
      receivedByBrowser.some((body) => body.includes(FAKE_BACKEND_API_KEY)),
    ).toBe(false);
  });
});

test("un correo inválido muestra «Correo inválido» y no llega al backend", async ({
  page,
  request,
}) => {
  const typedEmail = "no-es-un-correo";
  await page.goto("/register");

  await emailField(page).fill(typedEmail);
  await continueButton(page).click();

  await expect(page.getByText("Correo inválido")).toBeVisible();
  await expect(emailField(page)).toBeFocused();
  expect(await requestsFor(request, typedEmail)).toEqual([]);
});

test("un 400 del backend muestra su mensaje bajo el campo, con el foco en él", async ({
  page,
}) => {
  await page.goto("/register");

  await emailField(page).fill(uniqueEmail("rechazado"));
  await continueButton(page).click();

  await expect(
    page.getByText("No pudimos enviar el código a ese correo."),
  ).toBeVisible();
  await expect(emailField(page)).toBeFocused();
});

for (const { prefix, label, message } of [
  { prefix: "limite", label: "429", message: TOO_MANY_ATTEMPTS_ERROR },
  { prefix: "caido", label: "500", message: REQUEST_CODE_ERROR },
  { prefix: "gateway", label: "403 del gateway", message: REQUEST_CODE_ERROR },
]) {
  test(`un ${label} muestra su mensaje en español y conserva el correo`, async ({
    page,
  }) => {
    const email = uniqueEmail(prefix);
    await page.goto("/register");

    await emailField(page).fill(email);
    await continueButton(page).click();

    await expect(
      page.getByRole("alert").filter({ hasText: message }),
    ).toBeVisible();
    await expect(page.getByText(/Forbidden|Too Many Requests/)).toHaveCount(0);
    await expect(emailField(page)).toHaveValue(email);
  });
}
