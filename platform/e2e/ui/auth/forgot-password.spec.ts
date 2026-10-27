import type { Page } from "@playwright/test";
import { createApiContext, createMemberWithRole } from "../../support/accounts";
import {
  extractLink,
  readEmailsTo,
  waitForEmailTo,
  expectNoEmailTo,
} from "../../support/email";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import {
  backdateInvitationExpiry,
  countCredentialAccounts,
  getInvitationByToken,
  markInvitationAcceptedWithoutCredential,
  softDeleteMembership,
} from "../../support/invitations";
import {
  countResetTokens,
  createInviteHost,
  expireResetTokens,
  invitePendingToHost,
  PENDING_INVITATION_EMAIL_SUBJECT,
  readResetLink,
  requestResetViaPlatform,
  RESET_EMAIL_SUBJECT,
  resetPasswordViaPlatform,
  tokenFromLink,
} from "../../support/password-reset";
import { expect, test } from "../../support/test";
import {
  authPost,
  createConfirmedUser,
  E2E_PASSWORD,
  signIn,
  signUp,
  uniqueEmail,
} from "../../support/users";
import { getTestPrisma } from "../../support/db";
import { clinicDashboardUrl, loginViaUi } from "../../support/ui";
import { createOnboardedAdmin } from "../../support/accounts";

// docs/features/forgot-password/plan.md — CA-2, CA-7, CA-8, CA-14 a CA-16, CA-18, CA-22 a CA-24, CA-27 a CA-33 y CA-42.

const NEW_PASSWORD = "Otra-Clave-Nueva-2026";
const SENT_TITLE = "Revisa tu correo";
const INVALID_TITLE = "Este enlace ya no sirve";
const RESET_NOTICE = "Listo, ya puedes iniciar sesión con tu contraseña nueva.";
const SENT_TEXT =
  "Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja y la carpeta de spam.";

const passwordField = (page: Page) =>
  page.getByLabel("Contraseña nueva", { exact: true });
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Guardar contraseña", exact: true });

async function askForLink(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Correo electrónico").fill(email);
  await page
    .getByRole("button", { name: "Enviar enlace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: SENT_TITLE, exact: true }),
  ).toBeVisible();
}

async function saveNewPassword(page: Page, password: string) {
  await passwordField(page).fill(password);
  await saveButton(page).click();
}

function normalizedText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

async function isSessionClosed(
  context: Awaited<ReturnType<typeof createApiContext>>,
) {
  const response = await context.get(`${API_BASE_URL}/api/auth/get-session`);
  return (await response.json()) === null;
}

test("CA-7, CA-8, CA-14, CA-22, CA-23 y CA-24: pedir el enlace, abrirlo dos veces sin gastarlo, crear la contraseña nueva, ver el aviso y entrar con ella", async ({
  page,
  context,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "recupera",
    name: "Ana",
  });
  const otherDevice = await createApiContext();
  await signIn(otherDevice, user.email);
  expect(await isSessionClosed(otherDevice)).toBe(false);

  await page.goto("/login");
  await page
    .getByRole("link", { name: "¿Olvidaste tu contraseña?", exact: true })
    .click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Correo electrónico").fill(user.email);
  await page
    .getByRole("button", { name: "Enviar enlace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: SENT_TITLE, exact: true }),
  ).toBeVisible();

  const captured = await waitForEmailTo(user.email, {
    subject: RESET_EMAIL_SUBJECT,
  });
  const text = normalizedText(captured.html);
  expect(text).toContain("Hola Ana,");
  expect(text).toContain("Crear contraseña nueva");
  expect(text).toContain("El enlace vence en 1 hora y sirve una sola vez.");
  expect(text).toContain(
    "Al crear tu contraseña nueva cerraremos tu sesión en todos tus dispositivos.",
  );
  expect(text).toContain(
    "Si no lo pediste, ignora este correo; tu contraseña no cambia.",
  );
  expect(captured.html).not.toContain("{{");
  expect(
    readEmailsTo(user.email).filter(
      (email) => email.subject === RESET_EMAIL_SUBJECT,
    ),
  ).toHaveLength(1);

  const link = await readResetLink(user.email);
  expect(link).toMatch(
    new RegExp(`^${PLATFORM_BASE_URL}/reset-password#token=[A-Za-z0-9]{24}$`),
  );
  expect(link).not.toContain("?token=");
  expect(link).not.toContain("/api/auth/");
  expect(link).not.toContain("callbackURL");

  for (let scan = 0; scan < 2; scan += 1) {
    const scanner = await context.newPage();
    await scanner.goto(link);
    await expect(passwordField(scanner)).toBeVisible();
    await scanner.close();
  }

  await page.goto(link);
  await saveNewPassword(page, NEW_PASSWORD);

  await expect(page).toHaveURL(/\/login\?reset=ok$/);
  await expect(
    page.getByRole("status").getByText(RESET_NOTICE, { exact: true }),
  ).toBeVisible();

  const oldAttempt = await authPost(
    await createApiContext(),
    "/api/auth/sign-in/email",
    { email: user.email, password: E2E_PASSWORD },
  );
  expect(oldAttempt.status()).toBe(401);

  await loginViaUi(page, user.email, /\/onboarding$/, NEW_PASSWORD);
  expect(await isSessionClosed(otherDevice)).toBe(true);
});

test("CA-23 y CA-33: el administrador Gratis con sesión abierta en el mismo navegador recupera su contraseña sin ver un 402 y su sesión se cierra", async ({
  page,
}) => {
  const admin = await createOnboardedAdmin({ emailPrefix: "recupera-gratis" });
  await loginViaUi(page, admin.email, /\/onboarding$/);

  const paymentRequired: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 402) paymentRequired.push(response.url());
  });

  await askForLink(page, admin.email);
  await page.goto(await readResetLink(admin.email));
  await saveNewPassword(page, NEW_PASSWORD);

  await expect(page).toHaveURL(/\/login\?reset=ok$/);
  await expect(page.getByText(RESET_NOTICE, { exact: true })).toBeVisible();
  const session = await page.request.get(
    `${API_BASE_URL}/api/auth/get-session`,
  );
  expect(await session.json()).toBeNull();

  await loginViaUi(page, admin.email, /\/onboarding$/, NEW_PASSWORD);
  expect(paymentRequired).toEqual([]);
  await expect(page.getByText("Tu plan no permite")).toHaveCount(0);
});

test("CA-15: el enlace ya usado muestra «Este enlace ya no sirve», saca el token de la barra y «Pedir otro enlace» lleva a /forgot-password", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "reusa",
  });
  await requestResetViaPlatform(await createApiContext(), user.email);
  const link = await readResetLink(user.email);

  await page.goto(link);
  await saveNewPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/login\?reset=ok$/);

  await page.goto(link);
  await saveNewPassword(page, "Una-Tercera-Clave-2026");

  const title = page.getByRole("heading", { name: INVALID_TITLE, exact: true });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(
    page.getByText(
      "Los enlaces duran 1 hora y sirven una sola vez. Pide otro y ábrelo desde el correo más reciente.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/reset-password");
  expect(page.url()).not.toContain(tokenFromLink(link));

  await page
    .getByRole("link", { name: "Pedir otro enlace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("CA-16: el enlace vencido muestra «Este enlace ya no sirve» y la contraseña anterior sigue sirviendo", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "vencido",
  });
  await requestResetViaPlatform(await createApiContext(), user.email);
  const link = await readResetLink(user.email);
  await expireResetTokens(user.userId);

  await page.goto(link);
  await saveNewPassword(page, NEW_PASSWORD);

  await expect(
    page.getByRole("heading", { name: INVALID_TITLE, exact: true }),
  ).toBeVisible();
  await signIn(await createApiContext(), user.email, E2E_PASSWORD);
});

test("CA-18 y CA-42: un enlace sin token válido, sin fragmento o con el token en la query muestra «Este enlace ya no sirve» con el foco en el título y sin llamar al api", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "alterado",
  });
  await requestResetViaPlatform(await createApiContext(), user.email);
  const realToken = tokenFromLink(await readResetLink(user.email));

  const resetCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/reset-password")) {
      resetCalls.push(request.url());
    }
  });

  for (const path of [
    "/reset-password#token=abc",
    "/reset-password",
    `/reset-password?token=${realToken}`,
  ]) {
    await page.goto(path);
    const title = page.getByRole("heading", {
      name: INVALID_TITLE,
      exact: true,
    });
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
  }

  expect(resetCalls).toEqual([]);
  expect(await countResetTokens(user.userId)).toBe(1);
});

test("CA-2: existente, inexistente e invitado vigente ven la misma pantalla, salvo el correo, sin cambiar la URL", async ({
  page,
}) => {
  const existing = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "pantalla-existe",
  });
  const host = await createInviteHost();
  const invited = await invitePendingToHost(host);
  const emails = [
    existing.email,
    uniqueEmail("pantalla-no-existe"),
    invited.email,
  ];

  const screens: string[] = [];
  for (const email of emails) {
    await askForLink(page, email);
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(page.url()).not.toContain(encodeURIComponent(email));
    await expect(page.getByText(SENT_TEXT, { exact: true })).toBeVisible();
    await expect(
      page.getByText(`Correo que escribiste: ${email}`),
    ).toBeVisible();
    await expect(page.getByText("El enlace dura 1 hora.")).toBeVisible();
    const screen = (
      await page.locator("main, body").first().innerText()
    ).replace(email, "{correo}");
    expect(screen).not.toContain("If this email exists");
    screens.push(screen);
  }

  expect(screens[1]).toBe(screens[0]);
  expect(screens[2]).toBe(screens[0]);
});

test("CA-30: el invitado quitado antes de aceptar ve la misma pantalla y no recibe ningún correo", async ({
  page,
}) => {
  const host = await createInviteHost();
  const removed = await invitePendingToHost(host);
  await softDeleteMembership(removed.membershipId);

  await askForLink(page, removed.email);
  await expect(page.getByText(SENT_TEXT, { exact: true })).toBeVisible();

  await expectNoEmailTo(removed.email, { subject: RESET_EMAIL_SUBJECT });
  await expectNoEmailTo(removed.email, {
    subject: PENDING_INVITATION_EMAIL_SUBJECT,
  });
});

test("CA-27 y CA-28: el invitado vigente recibe «Tu invitación a WizyDoc sigue pendiente» y con su botón crea la contraseña y entra", async ({
  page,
}) => {
  const host = await createInviteHost();
  const invited = await invitePendingToHost(host);

  await askForLink(page, invited.email);
  await expect(page.getByText(SENT_TEXT, { exact: true })).toBeVisible();

  const captured = await waitForEmailTo(invited.email, {
    subject: PENDING_INVITATION_EMAIL_SUBJECT,
  });
  expect(captured.html).toContain(host.clinicName);
  expect(normalizedText(captured.html)).toContain("Aceptar invitación");
  expect(extractLink(captured.html, "/invite/accept")).toBe(
    `${PLATFORM_BASE_URL}/invite/accept?token=${invited.token}`,
  );
  await expectNoEmailTo(invited.email, { subject: RESET_EMAIL_SUBJECT });
  expect(await countCredentialAccounts(invited.userId)).toBe(0);
  expect((await getInvitationByToken(invited.token)).status).toBe("INVITED");

  await page.goto(`${PLATFORM_BASE_URL}/invite/accept?token=${invited.token}`);
  await page.getByLabel("Contraseña", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Activar cuenta" }).click();
  await expect(page).toHaveURL(clinicDashboardUrl(host.admin.accountId));
});

test("CA-29: el invitado con invitación vencida recibe el mismo asunto sin enlace a /invite/accept", async ({
  page,
}) => {
  const host = await createInviteHost();
  const invited = await invitePendingToHost(host);
  await backdateInvitationExpiry(invited.token);

  await askForLink(page, invited.email);
  await expect(page.getByText(SENT_TEXT, { exact: true })).toBeVisible();

  const captured = await waitForEmailTo(invited.email, {
    subject: PENDING_INVITATION_EMAIL_SUBJECT,
  });
  expect(captured.html).not.toContain("/invite/accept");
  expect(normalizedText(captured.html)).toContain(
    "Pide a quien te invitó que te envíe una nueva desde WizyDoc.",
  );
  await expectNoEmailTo(invited.email, { subject: RESET_EMAIL_SUBJECT });
  expect(await countCredentialAccounts(invited.userId)).toBe(0);
});

test("CA-32: el usuario con contraseña quitado de todas sus sedes recupera su contraseña de punta a punta", async ({
  page,
}) => {
  const host = await createInviteHost();
  const member = await createMemberWithRole({
    accountId: host.admin.accountId,
    resourceId: host.clinicId,
    role: "USER",
    createdBy: host.admin.userId,
  });
  await softDeleteMembership(member.membershipId);

  await askForLink(page, member.email);
  await page.goto(await readResetLink(member.email));
  await saveNewPassword(page, NEW_PASSWORD);

  await expect(page).toHaveURL(/\/login\?reset=ok$/);
  await signIn(await createApiContext(), member.email, NEW_PASSWORD);
});

test("CA-27 (aceptada sin contraseña): quien aceptó la invitación sin crear contraseña recibe el correo de recuperación normal", async ({
  page,
}) => {
  const host = await createInviteHost();
  const invited = await invitePendingToHost(host);
  await markInvitationAcceptedWithoutCredential(invited.token);

  await askForLink(page, invited.email);
  await expectNoEmailTo(invited.email, {
    subject: PENDING_INVITATION_EMAIL_SUBJECT,
  });
  const link = await readResetLink(invited.email);

  await page.goto(link);
  await saveNewPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/login\?reset=ok$/);
  expect(await countCredentialAccounts(invited.userId)).toBe(1);
});

test("CA-31: quien no confirmó su correo recibe el de recuperación, queda confirmado, entra con la nueva y llega a /onboarding", async ({
  page,
}) => {
  const email = uniqueEmail("sin-confirmar");
  await signUp(await createApiContext(), { email });
  const prisma = await getTestPrisma();
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { email } })).confirmed,
  ).toBe(false);

  await askForLink(page, email);
  await page.goto(await readResetLink(email));
  await saveNewPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/login\?reset=ok$/);

  expect(
    (await prisma.user.findUniqueOrThrow({ where: { email } })).confirmed,
  ).toBe(true);
  const oldAttempt = await authPost(
    await createApiContext(),
    "/api/auth/sign-in/email",
    { email, password: E2E_PASSWORD },
  );
  expect(oldAttempt.ok()).toBe(false);

  await loginViaUi(page, email, /\/onboarding$/, NEW_PASSWORD);
});

test("CA-17 y CA-20 (por pantalla): el segundo enlace sirve y el primero ya no", async ({
  page,
}) => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "dos-enlaces",
  });
  const context = await createApiContext();
  await requestResetViaPlatform(context, user.email);
  const first = await readResetLink(user.email);
  const sentBefore = readEmailsTo(user.email).length;
  await requestResetViaPlatform(context, user.email);
  const second = await readResetLink(user.email, sentBefore);
  expect(second).not.toBe(first);

  await page.goto(second);
  await saveNewPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/login\?reset=ok$/);

  await page.goto(first);
  await saveNewPassword(page, "Una-Tercera-Clave-2026");
  await expect(
    page.getByRole("heading", { name: INVALID_TITLE, exact: true }),
  ).toBeVisible();
  const reuse = await resetPasswordViaPlatform(
    context,
    tokenFromLink(second),
    "Una-Cuarta-Clave-2026",
  );
  expect(reuse.status()).toBe(400);
});
