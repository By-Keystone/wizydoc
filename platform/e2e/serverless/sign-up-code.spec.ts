import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { FAKE_BACKEND_API_KEY, FAKE_BACKEND_URL } from "../support/env";
import { expect, test } from "../support/test";
import { uniqueEmail } from "../support/users";

const SIGN_UP_PROGRESS_COOKIE = "sign_up_progress";
const CORRECT_CODE = "482913";
const WRONG_CODE = "111111";
const REJECTED_CODE_ERROR =
  "El código no es correcto o ya venció. Pide uno nuevo si lo necesitas.";
const INCOMPLETE_CODE_ERROR = "Escribe los 6 dígitos del código.";
const TOO_MANY_ATTEMPTS_ERROR =
  "Demasiados intentos. Intenta de nuevo en unos minutos.";
const VERIFY_CODE_ERROR = "No pudimos comprobar el código. Intenta de nuevo.";
const PAST_COOLDOWN_MS = 61_000;

interface RecordedRequest {
  path: string;
  email: string;
  code?: string;
  verificationToken?: string;
}

const emailField = (page: Page) =>
  page.getByLabel("Correo electrónico", { exact: true });
const codeField = (page: Page) =>
  page.getByLabel("Código de 6 dígitos", { exact: true });
const codeHeading = (page: Page) =>
  page.getByRole("heading", { name: "Revisa tu correo" });
const verifyButton = (page: Page) =>
  page.getByRole("button", { name: "Verificar código", exact: true });

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

const codeRequestsFor = (request: APIRequestContext, email: string) =>
  requestsFor(request, email, "/api/auth/sign-up/code");
const verifyRequestsFor = (request: APIRequestContext, email: string) =>
  requestsFor(request, email, "/api/auth/sign-up/code/verify");

async function reachCodeStep(page: Page, email: string) {
  await page.goto("/register");
  await emailField(page).fill(email);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(codeHeading(page)).toBeVisible();
}

async function readProgressCookie(context: BrowserContext) {
  const cookie = (await context.cookies()).find(
    (candidate) => candidate.name === SIGN_UP_PROGRESS_COOKIE,
  );
  if (!cookie) throw new Error("No hay cookie sign_up_progress");
  return {
    cookie,
    progress: JSON.parse(decodeURIComponent(cookie.value)) as {
      email: string;
      codeRequestedAt: number;
      verificationToken?: string;
    },
  };
}

test("tras «Continuar» la página muestra «Revisa tu correo» con el foco en el código, y recargar sigue ahí", async ({
  page,
}) => {
  await reachCodeStep(page, uniqueEmail("llegada"));

  expect(new URL(page.url()).pathname).toBe("/register");
  await expect(codeField(page)).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Reenviar en 60 s" }),
  ).toBeDisabled();

  await page.reload();

  await expect(codeHeading(page)).toBeVisible();
});

test("al escribir el sexto dígito se envía solo, el backend recibe la verificación una vez y la cookie guarda el token", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail("verificar");
  await reachCodeStep(page, email);

  await codeField(page).pressSequentially(CORRECT_CODE);

  await expect
    .poll(async () => (await verifyRequestsFor(request, email)).length)
    .toBe(1);
  const [verification] = await verifyRequestsFor(request, email);
  expect(verification.code).toBe(CORRECT_CODE);
  await expect
    .poll(
      async () =>
        (await readProgressCookie(context)).progress.verificationToken,
    )
    .toBe(verification.verificationToken);
  expect(new URL(page.url()).pathname).toBe("/register");
  await expect(codeHeading(page)).toBeVisible();
});

test("pegar «482 913» deja los 6 dígitos y se envía solo", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("pegado");
  await reachCodeStep(page, email);

  await codeField(page).fill("482 913");

  await expect(codeField(page)).toHaveValue(CORRECT_CODE);
  await expect
    .poll(async () => (await verifyRequestsFor(request, email)).length)
    .toBe(1);
});

test("un código que el backend rechaza deja en el código con el mensaje único y permite escribir otro", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("rechazo");
  await reachCodeStep(page, email);

  await codeField(page).pressSequentially(WRONG_CODE);

  await expect(page.getByText(REJECTED_CODE_ERROR)).toBeVisible();
  await expect(codeHeading(page)).toBeVisible();
  await expect(codeField(page)).toBeFocused();

  await codeField(page).pressSequentially(CORRECT_CODE);

  await expect
    .poll(async () => (await verifyRequestsFor(request, email)).length)
    .toBe(2);
});

test("con menos de 6 dígitos muestra «Escribe los 6 dígitos del código.» sin llamar al backend", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("incompleto");
  await reachCodeStep(page, email);

  await codeField(page).fill("482");
  await verifyButton(page).click();

  await expect(page.getByText(INCOMPLETE_CODE_ERROR)).toBeVisible();
  expect(await verifyRequestsFor(request, email)).toEqual([]);
});

for (const { prefix, label, message } of [
  { prefix: "limite", label: "429", message: TOO_MANY_ATTEMPTS_ERROR },
  { prefix: "caido", label: "500", message: VERIFY_CODE_ERROR },
  { prefix: "gateway", label: "403 del gateway", message: VERIFY_CODE_ERROR },
]) {
  test(`al verificar, un ${label} muestra su mensaje en español`, async ({
    page,
    context,
  }) => {
    const email = uniqueEmail(prefix);
    await page.goto("/register");
    await context.addCookies([
      {
        name: SIGN_UP_PROGRESS_COOKIE,
        value: encodeURIComponent(
          JSON.stringify({ email, codeRequestedAt: Date.now() }),
        ),
        url: new URL("/register", page.url()).toString(),
        httpOnly: true,
      },
    ]);
    await page.reload();
    await expect(codeHeading(page)).toBeVisible();

    await codeField(page).pressSequentially(CORRECT_CODE);

    await expect(
      page.getByRole("alert").filter({ hasText: message }),
    ).toBeVisible();
    await expect(page.getByText(/Forbidden|Too Many Requests/)).toHaveCount(0);
  });
}

test("el minuto del reenvío lo cuenta el servidor: pasado el minuto se reenvía el código y vuelve la cuenta", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail("reenvio");
  await reachCodeStep(page, email);
  await expect(
    page.getByRole("button", { name: "Reenviar en 60 s" }),
  ).toBeDisabled();
  const { cookie, progress } = await readProgressCookie(context);

  await context.addCookies([
    {
      ...cookie,
      value: encodeURIComponent(
        JSON.stringify({
          ...progress,
          codeRequestedAt: progress.codeRequestedAt - PAST_COOLDOWN_MS,
        }),
      ),
    },
  ]);
  await page.reload();

  const resendButton = page.getByRole("button", {
    name: "Reenviar código",
    exact: true,
  });
  await expect(resendButton).toBeEnabled();
  await resendButton.click();

  await expect(page.getByText("Te enviamos un código nuevo.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar en 60 s" }),
  ).toBeDisabled();
  expect(await codeRequestsFor(request, email)).toHaveLength(2);
});

test("«Cambiar» muestra el correo escrito con el foco, no toca la cookie y pedir el mismo correo dentro del minuto no llega al backend", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail("cambiar");
  await reachCodeStep(page, email);
  const { cookie: cookieBefore } = await readProgressCookie(context);

  await page.getByRole("button", { name: "Cambiar correo" }).click();

  await expect(emailField(page)).toHaveValue(email);
  await expect(emailField(page)).toBeFocused();
  expect((await readProgressCookie(context)).cookie.value).toBe(
    cookieBefore.value,
  );

  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  await expect(codeHeading(page)).toBeVisible();
  expect(await codeRequestsFor(request, email)).toHaveLength(1);
});

test("el token de verificación y la clave no llegan al navegador ni a ninguna URL", async ({
  page,
  request,
  context,
}) => {
  const email = uniqueEmail("privacidad");
  const browserUrls: string[] = [];
  const receivedByBrowser: string[] = [];
  page.on("request", (browserRequest) =>
    browserUrls.push(browserRequest.url()),
  );
  const readingResponses: Promise<void>[] = [];
  page.on("response", (response) => {
    readingResponses.push(
      (async () => {
        const { "set-cookie": setCookie = "", ...visibleHeaders } =
          await response.allHeaders();
        const otherCookies = setCookie
          .split("\n")
          .filter((line) => !line.startsWith(`${SIGN_UP_PROGRESS_COOKIE}=`));
        receivedByBrowser.push(
          JSON.stringify({ ...visibleHeaders, "set-cookie": otherCookies }),
        );
        receivedByBrowser.push(await response.text().catch(() => ""));
      })(),
    );
  });

  await reachCodeStep(page, email);
  await codeField(page).pressSequentially(CORRECT_CODE);
  await expect
    .poll(async () => (await verifyRequestsFor(request, email)).length)
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await readProgressCookie(context)).progress.verificationToken,
    )
    .toBeTruthy();
  await page.waitForLoadState("networkidle");
  await Promise.all(readingResponses);

  const [{ verificationToken }] = await verifyRequestsFor(request, email);
  if (!verificationToken) throw new Error("El backend no dio un token");
  expect(
    receivedByBrowser.some((body) => body.includes(verificationToken)),
  ).toBe(false);
  expect(
    receivedByBrowser.some((body) => body.includes(FAKE_BACKEND_API_KEY)),
  ).toBe(false);
  expect(
    browserUrls.some(
      (url) =>
        url.includes(verificationToken) ||
        url.includes(email) ||
        url.includes(encodeURIComponent(email)) ||
        url.startsWith(FAKE_BACKEND_URL),
    ),
  ).toBe(false);
});
