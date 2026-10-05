import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import { createApiContext, createOnboardedAdmin } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail } from "../../support/users";
import { seedLookupFixture } from "../../support/lookup-fixture";

/** docs/features/fix-user-by-email-scope/plan.md — CA-1 a CA-13 y CA-15 a CA-19 ([e2e]); CA-14 es [manual]. */

function lookup(context: APIRequestContext, resourceId: string, email: string) {
  return context.post(`${API_BASE_URL}/clinic/${resourceId}/users/lookup`, {
    data: { email },
  });
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1: la petición a GET /user/by-email es rechazada (401) y no recibe ningún dato", async () => {
    // 401 aquí es el genérico de "ruta no registrada" (policy.ts), no un chequeo real de sesión.
    const reception = await createOnboardedAdmin({ emailPrefix: "recepcion-ca1" });
    const member = await createOnboardedAdmin({ emailPrefix: "otra-cuenta-ca1" });

    const response = await member.context.get(
      `${API_BASE_URL}/user/by-email?email=${encodeURIComponent(reception.email)}`,
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("user");
  });

  test("CA-2: un miembro de otra cuenta busca desde su propia sede y recibe user null", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(fixture.account2.context, fixture.clinicZId, fixture.reception.email);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("CA-3: un miembro de otra cuenta recibe 404 al buscar sobre una sede que no es suya", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(fixture.account2.context, fixture.clinicAId, fixture.reception.email);

    expect(response.status()).toBe(404);
  });

  test("CA-4: recepción y el médico de la sede A reciben 403 al buscar al administrador", async () => {
    const fixture = await seedLookupFixture();

    const responseFromReception = await lookup(
      fixture.reception.context,
      fixture.clinicAId,
      fixture.account1.email,
    );
    expect(responseFromReception.status()).toBe(403);
    expect((await responseFromReception.json()).message).toBe("Insufficient role on this resource");

    const responseFromDoctor = await lookup(
      fixture.doctor.context,
      fixture.clinicAId,
      fixture.account1.email,
    );
    expect(responseFromDoctor.status()).toBe(403);
    expect((await responseFromDoctor.json()).message).toBe("Insufficient role on this resource");
  });

  test("CA-5: el administrador de sede (sólo de A) recibe 404 al buscar con el resourceId de B", async () => {
    const fixture = await seedLookupFixture();

    const responseOnA = await lookup(
      fixture.adminOfClinicA.context,
      fixture.clinicAId,
      fixture.reception.email,
    );
    expect(responseOnA.status()).toBe(200);

    const responseOnB = await lookup(
      fixture.adminOfClinicA.context,
      fixture.clinicBId,
      fixture.reception.email,
    );
    expect(responseOnB.status()).toBe(404);
  });

  test("CA-6: un atacante sin sesión recibe 401", async () => {
    const fixture = await seedLookupFixture();
    const anonymous = await createApiContext();

    const response = await lookup(anonymous, fixture.clinicAId, fixture.reception.email);

    expect(response.status()).toBe(401);
    const body = await response.json();
    // Distingue el 401 real (sesión ausente) del 401 "de mentira" de una ruta no registrada (CA-1).
    expect(body.message).not.toBe("Route has no policy declared");
  });

  test("CA-7: un resourceId inexistente responde 404", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account1.context,
      "00000000-0000-7000-8000-000000000000",
      fixture.reception.email,
    );

    expect(response.status()).toBe(404);
  });

  test("CA-8: el administrador busca con el resourceId de su organización el correo de otra cuenta", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(fixture.account1.context, fixture.organizationId, fixture.account2.email);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("CA-9: la búsqueda se acota por la cuenta de la sede, no por la de la sesión", async () => {
    const fixture = await seedLookupFixture();

    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { email: fixture.account2.email },
      data: { accountId: fixture.account1.accountId },
    });

    try {
      const responseFromZ = await lookup(fixture.account2.context, fixture.clinicZId, fixture.reception.email);
      expect(responseFromZ.status()).toBe(200);
      expect(await responseFromZ.json()).toEqual({ user: null });

      const responseFromA = await lookup(fixture.account2.context, fixture.clinicAId, fixture.reception.email);
      expect(responseFromA.status()).toBe(404);
    } finally {
      await prisma.user.update({
        where: { email: fixture.account2.email },
        data: { accountId: fixture.account2.accountId },
      });
    }
  });

  test("CA-10: buscar un texto que no es un correo responde 400", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(fixture.account1.context, fixture.clinicAId, "no-es-un-correo");

    expect(response.status()).toBe(400);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-11: correo inexistente y correo de otra cuenta responden igual, byte a byte", async () => {
    const fixture = await seedLookupFixture();

    const forNonExistentEmail = await lookup(
      fixture.account1.context,
      fixture.clinicAId,
      uniqueEmail("no-existe"),
    );
    const forOtherAccountEmail = await lookup(
      fixture.account1.context,
      fixture.clinicAId,
      fixture.account2.email,
    );

    expect(forNonExistentEmail.status()).toBe(200);
    expect(forOtherAccountEmail.status()).toBe(200);

    const bodyForNonExistentEmail = await forNonExistentEmail.json();
    expect(bodyForNonExistentEmail).toEqual({ user: null });
    expect(await forOtherAccountEmail.json()).toEqual(bodyForNonExistentEmail);
  });

  test("CA-12: la respuesta sólo trae name, lastName y phone, nunca id/email/accountId/role/confirmed/onboardingCompleted", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(fixture.account1.context, fixture.clinicAId, fixture.reception.email);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      user: {
        name: fixture.reception.name,
        lastName: fixture.reception.lastName,
        phone: fixture.reception.phone,
      },
    });
  });
});

test.describe("Lo que debe seguir funcionando", () => {
  test("CA-17: la búsqueda alcanza a toda la cuenta, no sólo a la sede del resourceId", async () => {
    const fixture = await seedLookupFixture();

    // El admin de organización tiene acceso heredado a B: la búsqueda es por cuenta, no por membership.
    const responseOnB = await lookup(fixture.account1.context, fixture.clinicBId, fixture.reception.email);
    expect(responseOnB.status()).toBe(200);
    expect(await responseOnB.json()).toEqual({
      user: {
        name: fixture.reception.name,
        lastName: fixture.reception.lastName,
        phone: fixture.reception.phone,
      },
    });

    // Control: la ruta funciona igual con una membership directa, sin herencia.
    const responseFromAdminOfA = await lookup(
      fixture.adminOfClinicA.context,
      fixture.clinicAId,
      fixture.doctor.email,
    );
    expect(responseFromAdminOfA.status()).toBe(200);
    expect(await responseFromAdminOfA.json()).toEqual({
      user: {
        name: fixture.doctor.name,
        lastName: fixture.doctor.lastName,
        phone: fixture.doctor.phone,
      },
    });
  });
});
