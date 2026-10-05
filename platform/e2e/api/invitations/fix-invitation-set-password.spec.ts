import { randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
} from "../../support/accounts";
import {
  authPost,
  E2E_PASSWORD,
  uniqueEmail,
  uniqueName,
} from "../../support/users";
import { getTestPrisma } from "../../support/db";
import {
  backdateInvitationExpiry,
  countCredentialAccounts,
  getInvitationByToken,
  getLatestSessionTrace,
  invitePendingUser,
  markInvitationAcceptedWithoutCredential,
  markInvitationExpiredStatus,
  softDeleteMembership,
} from "../../support/invitations";

/**
 * docs/features/fix-invitation-set-password/plan.md:
 * - CA-6, CA-8, CA-9, CA-10, CA-12, CA-14, CA-15, CA-16, CA-17, CA-18, CA-19,
 *   CA-20, CA-21 y CA-24 ([manual] convertidos aquí a prueba de API).
 * - CA-1 a CA-5, CA-11 y CA-13 son [e2e] de navegador: ver `e2e/ui/invitations/`
 *   y `e2e/ui/clinic/public-booking.spec.ts`.
 * - No automatizados: CA-7 (exige forzar un fallo interno de `signInEmail`; el
 *   propio plan dice "no reproducible en local"), CA-22 (requiere detener la
 *   base de pruebas compartida con el resto de la suite) y CA-23 (depende de
 *   leer la salida del proceso del api, no de una respuesta HTTP).
 */

const INVALID_INVITATION_BODY = {
  message: "El enlace de invitación no es válido o ya expiró",
};

function setPassword(
  context: APIRequestContext,
  body: Record<string, unknown>,
  baseUrl: string = API_BASE_URL,
  path: string = "/invitations/set-password",
) {
  return authPost(context, path, body, baseUrl);
}

function acceptInvitation(context: APIRequestContext, token: string) {
  return authPost(context, `/invitations/${token}/accept`, {});
}

test.describe("Lo que debe seguir funcionando", () => {
  test("CA-6: la sesión creada por set-password guarda ipAddress y userAgent", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca6" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA6"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA6"),
    });
    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "usuario-ca6",
    });

    const context = await createApiContext();
    const response = await context.post(
      `${API_BASE_URL}/invitations/set-password`,
      {
        headers: {
          Origin: PLATFORM_BASE_URL,
          "Content-Type": "application/json",
          "User-Agent": "verificacion-qa-ca6",
        },
        data: { token: invited.token, password: E2E_PASSWORD },
      },
    );
    expect(response.status()).toBe(200);

    const session = await getLatestSessionTrace(invited.userId);
    expect(session?.ipAddress).not.toBeNull();
    expect(session?.userAgent).toBe("verificacion-qa-ca6");
  });
});

test.describe("Lo que deja de ser posible", () => {
  test("CA-8: GET /clinic/:clinicId/doctors no devuelve userId", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca8" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA8"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA8"),
    });
    const specialtyId = await createSpecialty(
      admin,
      organizationId,
      uniqueName("Traumatología"),
    );
    await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "DOCTOR",
      emailPrefix: "doctor-ca8",
      specialtyIds: [specialtyId],
    });

    const anonymous = await createApiContext();
    const response = await anonymous.get(
      `${API_BASE_URL}/clinic/${clinicId}/doctors`,
    );

    expect(response.status()).toBe(200);
    const doctors = (await response.json()) as Record<string, unknown>[];
    expect(doctors.length).toBeGreaterThan(0);
    for (const doctor of doctors) {
      expect(doctor).not.toHaveProperty("userId");
    }
  });

  test("CA-9: userId sin token se rechaza por validación, sin set-cookie ni credencial, también vía platform", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca9" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA9"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA9"),
    });
    const victim = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "victima-ca9",
    });

    const apiContext = await createApiContext();
    const apiResponse = await setPassword(apiContext, {
      userId: victim.userId,
      password: "Atacante2026!",
    });
    expect(apiResponse.status()).toBe(400);
    expect(apiResponse.headers()["set-cookie"]).toBeUndefined();

    const platformContext = await createApiContext();
    const platformResponse = await setPassword(
      platformContext,
      { userId: victim.userId, password: "Atacante2026!" },
      PLATFORM_BASE_URL,
      "/api/invitations/set-password",
    );
    expect(platformResponse.status()).toBe(400);
    expect(platformResponse.headers()["set-cookie"]).toBeUndefined();

    expect(await countCredentialAccounts(victim.userId)).toBe(0);
  });

  test("CA-10: un userId ajeno en el cuerpo no roba la credencial de otro invitado", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca10" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA10"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA10"),
    });
    const h = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "h-ca10",
    });
    const j = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "j-ca10",
    });

    const context = await createApiContext();
    const response = await setPassword(context, {
      token: h.token,
      userId: j.userId,
      password: E2E_PASSWORD,
    });
    expect(response.status()).toBe(200);

    expect(await countCredentialAccounts(h.userId)).toBe(1);
    expect(await countCredentialAccounts(j.userId)).toBe(0);
    expect((await getInvitationByToken(j.token)).status).toBe("INVITED");
  });

  async function expectInvalidOnBothEndpoints(token: string) {
    const setPasswordContext = await createApiContext();
    const setPasswordResponse = await setPassword(setPasswordContext, {
      token,
      password: E2E_PASSWORD,
    });
    expect(setPasswordResponse.status()).toBe(400);
    expect(await setPasswordResponse.json()).toEqual(INVALID_INVITATION_BODY);

    const acceptContext = await createApiContext();
    const acceptResponse = await acceptInvitation(acceptContext, token);
    expect(acceptResponse.status()).toBe(400);
    expect(await acceptResponse.json()).toEqual(INVALID_INVITATION_BODY);
  }

  test("CA-12 y CA-19: token inexistente responde igual en set-password y en accept", async () => {
    await expectInvalidOnBothEndpoints(randomBytes(32).toString("hex"));
  });

  test("CA-12 y CA-19: token caducado por fecha responde igual en set-password y en accept", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca19-exp" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA19-EXP"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA19 EXP"),
    });
    const backdated = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "caducado-ca19",
    });
    await backdateInvitationExpiry(backdated.token);

    await expectInvalidOnBothEndpoints(backdated.token);
  });

  test("CA-12 y CA-19: token con estado EXPIRED responde igual en set-password y en accept", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca19-sts" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA19-STS"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA19 STS"),
    });
    const expiredStatus = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "expired-ca19",
    });
    await markInvitationExpiredStatus(expiredStatus.token);

    await expectInvalidOnBothEndpoints(expiredStatus.token);
  });

  test("CA-12 y CA-19: token de membership borrada responde igual en set-password y en accept", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca19-del" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA19-DEL"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA19 DEL"),
    });
    const deletedMembership = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "borrada-ca19",
    });
    await softDeleteMembership(deletedMembership.membershipId);

    await expectInvalidOnBothEndpoints(deletedMembership.token);
  });

  test("CA-12 y CA-19: token ya usado responde igual en set-password y en accept", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca19-usd" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA19-USD"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA19 USD"),
    });
    const alreadyUsed = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "usado-ca19",
    });
    const setupContext = await createApiContext();
    const setupResponse = await setPassword(setupContext, {
      token: alreadyUsed.token,
      password: E2E_PASSWORD,
    });
    expect(setupResponse.status()).toBe(200);

    await expectInvalidOnBothEndpoints(alreadyUsed.token);
  });

  test("CA-14: cinco peticiones simultáneas con el mismo token dejan exactamente una credencial", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca14" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA14"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA14"),
    });
    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "carrera-ca14",
    });

    const contexts = await Promise.all(
      Array.from({ length: 5 }, () => createApiContext()),
    );
    const responses = await Promise.all(
      contexts.map((context) =>
        setPassword(context, { token: invited.token, password: E2E_PASSWORD }),
      ),
    );

    const statuses = responses.map((response) => response.status()).sort();
    expect(statuses).toEqual([200, 400, 400, 400, 400]);
    expect(await countCredentialAccounts(invited.userId)).toBe(1);
  });

  test("CA-15: dos invitaciones pendientes del mismo usuario en paralelo dejan una sola credencial y la otra sigue en 'login'", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca15" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA15"),
    );
    const clinicA = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede A CA15"),
    });
    const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
      name: uniqueName("Sede B CA15"),
    });

    const email = uniqueEmail("doble-invitado-ca15");
    const inviteBody = {
      email,
      name: "Lucía",
      lastName: "Paredes",
      phone: "+51987654321",
      role: "USER" as const,
    };
    await inviteUserViaApi(admin, { ...inviteBody, resourceId: clinicA });
    await inviteUserViaApi(admin, { ...inviteBody, resourceId: clinicB });

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`No se encontró el usuario ${email}`);

    const invitationA = await prisma.userInvitation.findFirst({
      where: { membership: { userId: user.id, resourceId: clinicA } },
    });
    const invitationB = await prisma.userInvitation.findFirst({
      where: { membership: { userId: user.id, resourceId: clinicB } },
    });
    if (!invitationA || !invitationB)
      throw new Error("No se encontraron ambas invitaciones");

    const contextA = await createApiContext();
    const contextB = await createApiContext();
    const [responseA, responseB] = await Promise.all([
      setPassword(contextA, {
        token: invitationA.token,
        password: E2E_PASSWORD,
      }),
      setPassword(contextB, {
        token: invitationB.token,
        password: E2E_PASSWORD,
      }),
    ]);

    const statuses = [responseA.status(), responseB.status()].sort();
    expect(statuses).toEqual([200, 422]);
    expect(await countCredentialAccounts(user.id)).toBe(1);

    const [winnerToken, loserToken] =
      responseA.status() === 200
        ? [invitationA.token, invitationB.token]
        : [invitationB.token, invitationA.token];

    expect((await getInvitationByToken(winnerToken)).status).toBe("ACCEPTED");
    expect((await getInvitationByToken(loserToken)).status).toBe("INVITED");

    const anonymous = await createApiContext();
    const stepResponse = await anonymous.get(
      `${API_BASE_URL}/invitations/${loserToken}`,
    );
    expect(stepResponse.status()).toBe(200);
    expect((await stepResponse.json()).data.step).toBe("login");

    const acceptResponse = await acceptInvitation(anonymous, loserToken);
    expect(acceptResponse.status()).toBe(200);
    expect(await acceptResponse.json()).toEqual({
      message: "Invitation accepted",
      data: { step: "login" },
    });
  });

  test("CA-16 y CA-24: accept sin contraseña no consume el token y el mismo link deja fijarla después", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca16" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA16"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA16"),
    });
    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "sin-clave-ca16",
    });

    const context = await createApiContext();
    const acceptResponse = await acceptInvitation(context, invited.token);
    expect(acceptResponse.status()).toBe(422);
    expect(await acceptResponse.json()).toEqual({
      message: "Primero define tu contraseña desde el enlace de invitación",
    });

    const afterAccept = await getInvitationByToken(invited.token);
    expect(afterAccept.status).toBe("INVITED");
    expect(afterAccept.acceptedAt).toBeNull();

    const setPasswordResponse = await setPassword(context, {
      token: invited.token,
      password: E2E_PASSWORD,
    });
    expect(setPasswordResponse.status()).toBe(200);
  });

  test("CA-17: una contraseña fuera de rango se rechaza y la invitación sigue pendiente", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca17" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA17"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA17"),
    });
    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "clave-fuera-rango-ca17",
    });

    const context = await createApiContext();
    const tooShortResponse = await setPassword(context, {
      token: invited.token,
      password: "corta12",
    });
    expect(tooShortResponse.status()).toBe(400);

    const tooLongResponse = await setPassword(context, {
      token: invited.token,
      password: "a".repeat(129),
    });
    expect(tooLongResponse.status()).toBe(400);

    expect((await getInvitationByToken(invited.token)).status).toBe("INVITED");
    expect(await countCredentialAccounts(invited.userId)).toBe(0);
  });

  test("CA-18: invitación ACCEPTED sin credencial (dato heredado) queda bloqueada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca18" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA18"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA18"),
    });
    const invited = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "heredado-ca18",
    });
    await markInvitationAcceptedWithoutCredential(invited.token);

    const byTokenContext = await createApiContext();
    const byTokenResponse = await setPassword(byTokenContext, {
      token: invited.token,
      password: E2E_PASSWORD,
    });
    expect(byTokenResponse.status()).toBe(400);
    expect(await byTokenResponse.json()).toEqual(INVALID_INVITATION_BODY);

    const byUserIdContext = await createApiContext();
    const byUserIdResponse = await setPassword(byUserIdContext, {
      userId: invited.userId,
      password: "Atacante2026!",
    });
    expect(byUserIdResponse.status()).toBe(400);

    const getResponse = await byUserIdContext.get(
      `${API_BASE_URL}/invitations/${invited.token}`,
    );
    expect(getResponse.status()).toBe(422);

    expect(await countCredentialAccounts(invited.userId)).toBe(0);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-20: un token mal formado se rechaza por validación", async () => {
    const context = await createApiContext();

    const response = await setPassword(context, {
      token: "no-es-hex",
      password: E2E_PASSWORD,
    });

    expect(response.status()).toBe(400);
  });

  test("CA-21: las respuestas exitosas de set-password y accept no incluyen userId ni email", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca21" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA21"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA21"),
    });

    const forSetPassword = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "ca21-set-password",
    });
    const setPasswordContext = await createApiContext();
    const setPasswordResponse = await setPassword(setPasswordContext, {
      token: forSetPassword.token,
      password: E2E_PASSWORD,
    });
    expect(setPasswordResponse.status()).toBe(200);
    const setPasswordBody = await setPasswordResponse.json();
    expect(setPasswordBody.data).toEqual({
      accountId: admin.accountId,
      isSignedIn: true,
    });

    const forAccept = await invitePendingUser(admin, {
      resourceId: clinicId,
      role: "USER",
      emailPrefix: "ca21-accept",
    });
    const acceptSetupContext = await createApiContext();
    await setPassword(acceptSetupContext, {
      token: forAccept.token,
      password: E2E_PASSWORD,
    });

    const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
      name: uniqueName("Sede B CA21"),
    });
    await inviteUserViaApi(admin, {
      email: forAccept.email,
      name: "Lucía",
      lastName: "Paredes",
      phone: "+51987654321",
      role: "USER",
      resourceId: clinicB,
    });

    const prisma = await getTestPrisma();
    const secondInvitation = await prisma.userInvitation.findFirst({
      where: { membership: { userId: forAccept.userId, resourceId: clinicB } },
    });
    if (!secondInvitation)
      throw new Error("No se encontró la segunda invitación");

    const acceptContext = await createApiContext();
    const acceptResponse = await acceptInvitation(
      acceptContext,
      secondInvitation.token,
    );
    expect(acceptResponse.status()).toBe(200);
    expect(await acceptResponse.json()).toEqual({
      message: "Invitation accepted",
      data: { step: "login" },
    });
  });
});
