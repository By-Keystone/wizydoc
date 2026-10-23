import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import { createApiContext, createOnboardedAdmin } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail } from "../../support/users";
import { seedLookupFixture } from "../../support/lookup-fixture";

/** docs/features/fix-user-by-email-scope/plan.md y docs/features/doctor-profile-membership/plan.md (t-10): la búsqueda por correo es sólo la de la organización. */

function lookup(context: APIRequestContext, resourceId: string, email: string) {
  return context.post(
    `${API_BASE_URL}/organization/${resourceId}/users/lookup`,
    { data: { email } },
  );
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1: la petición a GET /user/by-email es rechazada (401) y no recibe ningún dato", async () => {
    // 401 aquí es el genérico de "ruta no registrada" (policy.ts), no un chequeo real de sesión.
    const reception = await createOnboardedAdmin({
      emailPrefix: "recepcion-ca1",
    });
    const member = await createOnboardedAdmin({
      emailPrefix: "otra-cuenta-ca1",
    });

    const response = await member.context.get(
      `${API_BASE_URL}/user/by-email?email=${encodeURIComponent(reception.email)}`,
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("user");
  });

  test("la búsqueda por sede ya no existe: POST /clinic/:resourceId/users/lookup responde 401", async () => {
    const fixture = await seedLookupFixture();

    const response = await fixture.account1.context.post(
      `${API_BASE_URL}/clinic/${fixture.clinicAId}/users/lookup`,
      { data: { email: fixture.reception.email } },
    );

    expect(response.status()).toBe(401);
    expect(await response.json()).not.toHaveProperty("user");
  });

  test("CA-2: un miembro de otra cuenta busca desde su propia organización y recibe user null", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account2.context,
      fixture.organization2Id,
      fixture.reception.email,
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("CA-3: un miembro de otra cuenta recibe 404 al buscar sobre una organización que no es suya", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account2.context,
      fixture.organizationId,
      fixture.reception.email,
    );

    expect(response.status()).toBe(404);
  });

  test("CA-4: recepción y el médico de la sede A no pueden buscar al administrador", async () => {
    const fixture = await seedLookupFixture();

    for (const actor of [fixture.reception, fixture.doctor]) {
      const response = await lookup(
        actor.context,
        fixture.organizationId,
        fixture.account1.email,
      );

      expect([403, 404]).toContain(response.status());
      expect(await response.json()).not.toHaveProperty("user");
    }
  });

  test("CA-5: el administrador sólo de la sede A recibe 404 al buscar con el id de la organización", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.adminOfClinicA.context,
      fixture.organizationId,
      fixture.reception.email,
    );

    expect(response.status()).toBe(404);
  });

  test("CA-6: un atacante sin sesión recibe 401", async () => {
    const fixture = await seedLookupFixture();
    const anonymous = await createApiContext();

    const response = await lookup(
      anonymous,
      fixture.organizationId,
      fixture.reception.email,
    );

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

    const response = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      fixture.account2.email,
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });

  test("CA-9: la búsqueda se acota por la cuenta de la organización, no por la de la sesión", async () => {
    const fixture = await seedLookupFixture();

    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { email: fixture.account2.email },
      data: { accountId: fixture.account1.accountId },
    });

    try {
      const responseFromZ = await lookup(
        fixture.account2.context,
        fixture.organization2Id,
        fixture.reception.email,
      );
      expect(responseFromZ.status()).toBe(200);
      expect(await responseFromZ.json()).toEqual({ user: null });

      const responseFromA = await lookup(
        fixture.account2.context,
        fixture.organizationId,
        fixture.reception.email,
      );
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

    const response = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      "no-es-un-correo",
    );

    expect(response.status()).toBe(400);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-11: correo inexistente y correo de otra cuenta responden igual, byte a byte", async () => {
    const fixture = await seedLookupFixture();

    const forNonExistentEmail = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      uniqueEmail("no-existe"),
    );
    const forOtherAccountEmail = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      fixture.account2.email,
    );

    expect(forNonExistentEmail.status()).toBe(200);
    expect(forOtherAccountEmail.status()).toBe(200);

    const bodyForNonExistentEmail = await forNonExistentEmail.json();
    expect(bodyForNonExistentEmail).toEqual({ user: null });
    expect(await forOtherAccountEmail.json()).toEqual(bodyForNonExistentEmail);
  });

  test("CA-12: la respuesta sólo trae name, lastName, phone, isAccountOwner, organizationRole y clinics, nunca id/email/accountId/role/confirmed/onboardingCompleted", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      fixture.reception.email,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      user: {
        name: fixture.reception.name,
        lastName: fixture.reception.lastName,
        phone: fixture.reception.phone,
        isAccountOwner: false,
        organizationRole: null,
        clinics: [
          { clinicId: fixture.clinicAId, role: "USER", specialties: [] },
        ],
      },
    });
    const raw = JSON.stringify(body);
    for (const forbidden of [
      '"id"',
      '"email"',
      '"accountId"',
      '"confirmed"',
      '"onboardingCompleted"',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });
});

test.describe("Lo que debe seguir funcionando", () => {
  test("CA-17: la búsqueda alcanza a toda la cuenta y trae la membership del médico en su sede", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      fixture.doctor.email,
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        name: fixture.doctor.name,
        lastName: fixture.doctor.lastName,
        phone: fixture.doctor.phone,
        isAccountOwner: false,
        organizationRole: null,
        clinics: [
          { clinicId: fixture.clinicAId, role: "DOCTOR", specialties: [] },
        ],
      },
    });
  });

  test("el dueño sale con isAccountOwner y su rol en la organización", async () => {
    const fixture = await seedLookupFixture();

    const response = await lookup(
      fixture.account1.context,
      fixture.organizationId,
      fixture.account1.email,
    );

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as {
      user: { isAccountOwner: boolean; organizationRole: string | null };
    };
    expect(user.isAccountOwner).toBe(true);
    expect(user.organizationRole).toBe("ADMIN");
  });
});
