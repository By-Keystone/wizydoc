import { randomUUID } from "node:crypto";
import { type APIResponse } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import { getTestPrisma } from "../../support/db";
import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import {
  E2E_PASSWORD,
  authPost,
  createConfirmedUser,
  signUp,
  signUpRaw,
  uniqueEmail,
  uniqueName,
} from "../../support/users";

/** docs/features/fix-auth-user-fields-input/plan.md — CA-1 a CA-14 ([e2e]); CA-15 a CA-20 son [manual]. */

function signUpBody(email: string, extra: Record<string, unknown> = {}) {
  return {
    name: "Lucía",
    lastName: "Paredes",
    phone: "+51987654321",
    email,
    password: E2E_PASSWORD,
    ...extra,
  };
}

async function expectUserRowAbsent(email: string) {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  expect(user).toBeNull();
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1: sign-up con el accountId real de un médico víctima se rechaza y no crea el usuario", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca1" });
    const email = uniqueEmail("intruso-accountid");

    const attacker = await createApiContext();
    const response = await signUpRaw(attacker, signUpBody(email, { accountId: victim.accountId }));

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      message: "accountId is not allowed to be set",
      code: "FIELD_NOT_ALLOWED",
    });
    await expectUserRowAbsent(email);
  });

  test('CA-2: sign-up con role: "ADMIN" se rechaza y no crea el usuario', async ({ request }) => {
    const email = uniqueEmail("intruso-role");

    const response = await signUpRaw(request, signUpBody(email, { role: "ADMIN" }));

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      message: "role is not allowed to be set",
      code: "FIELD_NOT_ALLOWED",
    });
    await expectUserRowAbsent(email);
  });

  test("CA-3: sign-up con onboardingCompleted true o con el texto \"false\" se rechaza en ambos casos", async () => {
    const contextForBoolean = await createApiContext();
    const emailForBoolean = uniqueEmail("intruso-onboarding-bool");
    const responseForBoolean = await signUpRaw(
      contextForBoolean,
      signUpBody(emailForBoolean, { onboardingCompleted: true }),
    );
    expect(responseForBoolean.status()).toBe(400);
    expect(await responseForBoolean.json()).toEqual({
      message: "onboardingCompleted is not allowed to be set",
      code: "FIELD_NOT_ALLOWED",
    });
    await expectUserRowAbsent(emailForBoolean);

    const contextForString = await createApiContext();
    const emailForString = uniqueEmail("intruso-onboarding-string");
    const responseForString = await signUpRaw(
      contextForString,
      signUpBody(emailForString, { onboardingCompleted: "false" }),
    );
    expect(responseForString.status()).toBe(400);
    expect(await responseForString.json()).toEqual({
      message: "onboardingCompleted is not allowed to be set",
      code: "FIELD_NOT_ALLOWED",
    });
    await expectUserRowAbsent(emailForString);
  });

  test("CA-4: el mismo rechazo ocurre a través del rewrite de platform", async ({ request }) => {
    const email = uniqueEmail("intruso-platform");

    const responseViaApi = await signUpRaw(
      request,
      signUpBody(uniqueEmail("intruso-platform-control"), { accountId: randomUUID() }),
    );
    const responseViaPlatform = await signUpRaw(
      request,
      signUpBody(email, { accountId: randomUUID() }),
      PLATFORM_BASE_URL,
    );

    expect(responseViaPlatform.status()).toBe(responseViaApi.status());
    expect(await responseViaPlatform.json()).toEqual(await responseViaApi.json());
    await expectUserRowAbsent(email);
  });

  test("CA-5: accountId null, o confirmed/emailVerified forzados, responden 200 sin cuenta ni confirmación", async () => {
    const contextForNullAccountId = await createApiContext();
    const emailForNullAccountId = uniqueEmail("intruso-accountid-null");
    const responseForNullAccountId = await signUpRaw(
      contextForNullAccountId,
      signUpBody(emailForNullAccountId, { accountId: null }),
    );
    expect(responseForNullAccountId.status()).toBe(200);

    const contextForConfirmed = await createApiContext();
    const emailForConfirmed = uniqueEmail("intruso-confirmed");
    const responseForConfirmed = await signUpRaw(
      contextForConfirmed,
      signUpBody(emailForConfirmed, { confirmed: true, emailVerified: true }),
    );
    expect(responseForConfirmed.status()).toBe(200);

    const prisma = await getTestPrisma();

    const userWithNullAccountId = await prisma.user.findUnique({
      where: { email: emailForNullAccountId },
    });
    expect(userWithNullAccountId?.accountId).toBeNull();
    expect(userWithNullAccountId?.confirmed).toBe(false);
    expect(userWithNullAccountId?.onboardingCompleted).toBe(false);

    const userWithForcedConfirmed = await prisma.user.findUnique({
      where: { email: emailForConfirmed },
    });
    expect(userWithForcedConfirmed?.confirmed).toBe(false);
    expect(userWithForcedConfirmed?.accountId).toBeNull();
    expect(userWithForcedConfirmed?.onboardingCompleted).toBe(false);
  });

  test("CA-6: update-user con sesión responde 404 en los seis cuerpos del plan", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca6" });

    const attackerContext = await createApiContext();
    const { userId } = await createConfirmedUser(attackerContext, { emailPrefix: "atacante-ca6" });

    const bodies: Record<string, unknown>[] = [
      { accountId: victim.accountId },
      { onboardingCompleted: true },
      { role: "ADMIN" },
      { accountId: "" },
      { accountId: null },
      { name: "Nombre Cambiado" },
    ];

    for (const body of bodies) {
      const response = await authPost(attackerContext, "/api/auth/update-user", body);
      expect(response.status(), `cuerpo: ${JSON.stringify(body)}`).toBe(404);
    }

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.accountId).toBeNull();
    expect(user?.role).toBe("USER");
    expect(user?.onboardingCompleted).toBe(false);
    expect(user?.name).not.toBe("Nombre Cambiado");
  });

  test("CA-7: todas las variantes de ruta de update-user responden 404", async () => {
    const context = await createApiContext();
    await createConfirmedUser(context, { emailPrefix: "atacante-ca7" });

    const attempts: Array<{ label: string; call: () => Promise<APIResponse> }> = [
      {
        label: "/api/auth/update-user/ (barra final)",
        call: () =>
          context.post(`${API_BASE_URL}/api/auth/update-user/`, {
            headers: { Origin: PLATFORM_BASE_URL },
            data: { accountId: randomUUID() },
          }),
      },
      {
        label: "/api/auth//update-user (doble barra)",
        call: () =>
          context.post(`${API_BASE_URL}/api/auth//update-user`, {
            headers: { Origin: PLATFORM_BASE_URL },
            data: { accountId: randomUUID() },
          }),
      },
      {
        label: "update-user vía rewrite de platform",
        call: () => authPost(context, "/api/auth/update-user", { accountId: randomUUID() }, PLATFORM_BASE_URL),
      },
    ];

    for (const attempt of attempts) {
      const response = await attempt.call();
      expect(response.status(), attempt.label).toBe(404);
    }
  });

  test("CA-8: update-user sin sesión responde 404, no 401", async () => {
    const anonymous = await createApiContext();

    const response = await authPost(anonymous, "/api/auth/update-user", { name: "x" });

    expect(response.status()).toBe(404);
  });

  test("CA-9: tras los intentos de CA-6 y CA-7, GET /user/me no cambió", async ({ request }) => {
    const { userId } = await createConfirmedUser(request, { emailPrefix: "atacante-ca9" });

    const meBeforeResponse = await request.get(`${API_BASE_URL}/user/me`, {
      headers: { Origin: PLATFORM_BASE_URL },
    });
    const meBefore = await meBeforeResponse.json();

    const attempts: Record<string, unknown>[] = [
      { accountId: randomUUID() },
      { onboardingCompleted: true },
      { role: "ADMIN" },
    ];
    for (const body of attempts) {
      await authPost(request, "/api/auth/update-user", body);
    }
    await request.post(`${API_BASE_URL}/api/auth/update-user/`, {
      headers: { Origin: PLATFORM_BASE_URL },
      data: { accountId: randomUUID() },
    });
    await authPost(request, "/api/auth/update-user", { accountId: randomUUID() }, PLATFORM_BASE_URL);

    const meAfterResponse = await request.get(`${API_BASE_URL}/user/me`, {
      headers: { Origin: PLATFORM_BASE_URL },
    });
    const meAfter = await meAfterResponse.json();

    expect(meAfter.id).toBe(userId);
    expect(meAfter.accountId).toBe(meBefore.accountId);
    expect(meAfter.role).toBe(meBefore.role);
    expect(meAfter.onboardingCompleted).toBe(meBefore.onboardingCompleted);
  });

  test("CA-10: el atacante no puede ver la sede de la víctima por GET /clinic/:resourceId/users ni por GET /clinic", async () => {
    const victim = await createOnboardedAdmin({ emailPrefix: "victima-ca10" });
    const organizationId = await createOrganizationResource(victim, uniqueName("ORG-CA10"));
    const clinicId = await createClinicResource(victim, organizationId, {
      name: uniqueName("Sede víctima"),
    });

    const attacker = await createOnboardedAdmin({ emailPrefix: "atacante-ca10" });

    const usersResponse = await attacker.context.get(`${API_BASE_URL}/clinic/${clinicId}/users`);
    expect(usersResponse.status()).toBe(404);

    const clinicsResponse = await attacker.context.get(`${API_BASE_URL}/clinic`);
    expect(clinicsResponse.status()).toBe(200);
    const clinics = (await clinicsResponse.json()) as Array<{ resourceId: string }>;
    expect(clinics.some((clinic) => clinic.resourceId === clinicId)).toBe(false);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-11: sign-up con accountId responde igual exista o no el correo (sin enumeración)", async () => {
    const existingEmail = uniqueEmail("victima-ca11");
    const setupContext = await createApiContext();
    await signUp(setupContext, { email: existingEmail });

    const forgedAccountId = randomUUID();

    const contextForNewEmail = await createApiContext();
    const newEmail = uniqueEmail("nuevo-ca11");
    const responseForNewEmail = await signUpRaw(
      contextForNewEmail,
      signUpBody(newEmail, { accountId: forgedAccountId }),
    );
    const bodyForNewEmail = await responseForNewEmail.json();

    const contextForExistingEmail = await createApiContext();
    const responseForExistingEmail = await signUpRaw(
      contextForExistingEmail,
      signUpBody(existingEmail, { accountId: forgedAccountId }),
    );
    const bodyForExistingEmail = await responseForExistingEmail.json();

    expect(responseForNewEmail.status()).toBe(400);
    expect(responseForExistingEmail.status()).toBe(responseForNewEmail.status());
    expect(bodyForExistingEmail).toEqual(bodyForNewEmail);
  });
});

test.describe("Lo que debe seguir funcionando", () => {
  test("sign-up legítimo crea el usuario con los valores por defecto del servidor (control, no es un CA)", async ({
    request,
  }) => {
    const email = uniqueEmail("legitimo");

    const response = await signUpRaw(request, signUpBody(email));

    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.accountId).toBeNull();
    expect(user!.role).toBe("USER");
    expect(user!.onboardingCompleted).toBe(false);
  });

  test("un usuario normal obtiene su accountId en GET /user/me tras completar el onboarding (control, no es un CA)", async ({
    request,
  }) => {
    const { userId } = await createConfirmedUser(request, { emailPrefix: "usuario-normal" });

    const accountResponse = await request.post(`${API_BASE_URL}/account`, {
      headers: { Origin: PLATFORM_BASE_URL },
      data: { accountName: uniqueName("Consultorio") },
    });
    expect(accountResponse.status()).toBe(201);
    const { accountId } = await accountResponse.json();

    const meResponse = await request.get(`${API_BASE_URL}/user/me`, {
      headers: { Origin: PLATFORM_BASE_URL },
    });
    expect(meResponse.status()).toBe(200);

    const me = await meResponse.json();
    expect(me.id).toBe(userId);
    expect(me.accountId).toBe(accountId);
    expect(me.onboardingCompleted).toBe(true);
  });
});
