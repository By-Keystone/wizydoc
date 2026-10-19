import { createApiContext, createMemberWithRole } from "../../support/accounts";
import {
  expectNoEmailTo,
  extractLink,
  waitForEmailTo,
} from "../../support/email";
import {
  backdateInvitationExpiry,
  countCredentialAccounts,
  getInvitationByToken,
  softDeleteMembership,
} from "../../support/invitations";
import {
  countResetTokens,
  createInviteHost,
  invitePendingToHost,
  listResetTokens,
  PENDING_INVITATION_EMAIL_SUBJECT,
  readResetLink,
  requestResetViaPlatform,
  RESET_EMAIL_SUBJECT,
  resetPasswordViaPlatform,
  tokenAppearsInIdentifiers,
  tokenFromLink,
  waitForResetLinks,
} from "../../support/password-reset";
import { expect, test } from "../../support/test";
import {
  createConfirmedUser,
  signIn,
  signUp,
  uniqueEmail,
} from "../../support/users";

// docs/features/forgot-password/plan.md — CA-1, CA-3, CA-9, CA-13, CA-17, CA-20, CA-27 y CA-32 (api).

const NEW_PASSWORD = "Otra-Clave-Nueva-2026";
const MEDIAN_TOLERANCE_MS = 100;
const TIMING_SAMPLES = 10;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test("CA-1: los seis tipos de correo reciben el mismo 200, el mismo cuerpo y ninguna cookie", async () => {
  const context = await createApiContext();
  const confirmed = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ca1-confirmado",
  });
  const unconfirmedEmail = uniqueEmail("ca1-sin-confirmar");
  await signUp(await createApiContext(), { email: unconfirmedEmail });

  const host = await createInviteHost();
  const live = await invitePendingToHost(host);
  const expired = await invitePendingToHost(host);
  await backdateInvitationExpiry(expired.token);
  const removed = await invitePendingToHost(host);
  await softDeleteMembership(removed.membershipId);

  const emails = [
    confirmed.email,
    unconfirmedEmail,
    live.email,
    expired.email,
    removed.email,
    uniqueEmail("ca1-no-existe"),
  ];

  const responses = [];
  for (const email of emails) {
    const response = await requestResetViaPlatform(context, email);
    responses.push({
      status: response.status(),
      body: await response.json(),
      setCookie: response.headers()["set-cookie"],
    });
  }

  for (const response of responses) {
    expect(response.status).toBe(200);
    expect(response.body).toEqual(responses[0].body);
    expect(response.setCookie).toBeUndefined();
  }
});

test("CA-3: pedir el enlace de un correo con cuenta no tarda más de 100 ms que con uno que no existe", async () => {
  const context = await createApiContext();
  const existing = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ca3-existe",
  });

  await requestResetViaPlatform(context, existing.email);
  await requestResetViaPlatform(context, uniqueEmail("ca3-calentamiento"));

  const existingMs: number[] = [];
  const missingMs: number[] = [];
  for (let sample = 0; sample < TIMING_SAMPLES; sample += 1) {
    let startedAt = performance.now();
    await requestResetViaPlatform(context, existing.email);
    existingMs.push(performance.now() - startedAt);

    startedAt = performance.now();
    await requestResetViaPlatform(context, uniqueEmail("ca3-no-existe"));
    missingMs.push(performance.now() - startedAt);
  }

  expect(median(existingMs) - median(missingMs)).toBeLessThanOrEqual(
    MEDIAN_TOLERANCE_MS,
  );
});

test("CA-9 y CA-13: el token no está en claro en `verification` y la fila vence en 59 a 61 minutos", async () => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ca9",
  });
  const context = await createApiContext();

  const askedAt = Date.now();
  const response = await requestResetViaPlatform(context, user.email);
  expect(response.status()).toBe(200);
  const token = tokenFromLink(await readResetLink(user.email));

  expect(token).toMatch(/^[A-Za-z0-9]{24}$/);
  expect(await tokenAppearsInIdentifiers(token)).toBe(false);

  const rows = await listResetTokens(user.userId);
  expect(rows).toHaveLength(1);
  const minutesToExpire = (rows[0].expiresAt.getTime() - askedAt) / 60_000;
  expect(minutesToExpire).toBeGreaterThanOrEqual(59);
  expect(minutesToExpire).toBeLessThanOrEqual(61);
});

test("CA-17: al usar el segundo enlace el primero y el mismo segundo dejan de servir y no queda ningún token", async () => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ca17",
  });
  const context = await createApiContext();

  await requestResetViaPlatform(context, user.email);
  await waitForResetLinks(user.email, 1);
  await requestResetViaPlatform(context, user.email);
  const [first, second] = (await waitForResetLinks(user.email, 2)).map(
    tokenFromLink,
  );
  expect(await countResetTokens(user.userId)).toBe(2);

  const used = await resetPasswordViaPlatform(context, second, NEW_PASSWORD);
  expect(used.status()).toBe(200);

  for (const token of [first, second]) {
    const rejected = await resetPasswordViaPlatform(
      context,
      token,
      "Otra-Mas-2026!",
    );
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).code).toBe("INVALID_TOKEN");
  }
  expect(await countResetTokens(user.userId)).toBe(0);
});

test("CA-20: 7 y 129 caracteres se rechazan sin gastar el token y con 128 se guarda", async () => {
  const user = await createConfirmedUser(await createApiContext(), {
    emailPrefix: "ca20",
  });
  const context = await createApiContext();
  await requestResetViaPlatform(context, user.email);
  const token = tokenFromLink(await readResetLink(user.email));

  const tooShort = await resetPasswordViaPlatform(
    context,
    token,
    "a".repeat(7),
  );
  expect(tooShort.status()).toBe(400);
  expect((await tooShort.json()).code).toBe("PASSWORD_TOO_SHORT");

  const tooLong = await resetPasswordViaPlatform(
    context,
    token,
    "a".repeat(129),
  );
  expect(tooLong.status()).toBe(400);
  expect((await tooLong.json()).code).toBe("PASSWORD_TOO_LONG");

  const saved = await resetPasswordViaPlatform(context, token, "a".repeat(128));
  expect(saved.status()).toBe(200);
});

test("CA-27: pedir el enlace no le da contraseña al invitado y su invitación sigue pendiente", async () => {
  const host = await createInviteHost();
  const invited = await invitePendingToHost(host);
  const context = await createApiContext();

  const response = await requestResetViaPlatform(context, invited.email);
  expect(response.status()).toBe(200);
  const pending = await waitForEmailTo(invited.email, {
    subject: PENDING_INVITATION_EMAIL_SUBJECT,
  });

  expect(pending.html).toContain(host.clinicName);
  expect(extractLink(pending.html, "/invite/accept")).toContain(
    `/invite/accept?token=${invited.token}`,
  );
  expect(await countCredentialAccounts(invited.userId)).toBe(0);
  expect((await getInvitationByToken(invited.token)).status).toBe("INVITED");
  await expectNoEmailTo(invited.email, { subject: RESET_EMAIL_SUBJECT });
});

test("CA-32: un usuario con contraseña quitado de todas sus sedes recibe el correo de recuperación", async () => {
  const host = await createInviteHost();
  const member = await createMemberWithRole({
    accountId: host.admin.accountId,
    resourceId: host.clinicId,
    role: "USER",
    createdBy: host.admin.userId,
  });
  await softDeleteMembership(member.membershipId);
  const context = await createApiContext();

  const response = await requestResetViaPlatform(context, member.email);
  expect(response.status()).toBe(200);

  const link = await readResetLink(member.email);
  const saved = await resetPasswordViaPlatform(
    context,
    tokenFromLink(link),
    NEW_PASSWORD,
  );
  expect(saved.status()).toBe(200);
  await signIn(await createApiContext(), member.email, NEW_PASSWORD);
});
