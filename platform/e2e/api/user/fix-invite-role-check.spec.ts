import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import { createApiContext, createSpecialty } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail, uniqueName } from "../../support/users";
import { seedLookupFixture, type LookupFixture } from "../../support/lookup-fixture";

/**
 * docs/features/fix-invite-role-check/plan.md:
 * - CA-3 a CA-20 ([manual] convertidos aquí a prueba de API), salvo CA-15 y
 *   CA-19 (ver abajo).
 * - CA-1, CA-2 y CA-7 son [e2e] de navegador: ver
 *   `e2e/ui/clinic/invite-user-form.spec.ts`.
 * - CA-15 no se automatiza: su premisa (forjar `accountId` propio con
 *   `POST /api/auth/update-user`) ya está cerrada por el fix de `auth.ts`
 *   fusionado en main (`fix-auth-user-fields-input`, PR #37 — ver
 *   `api/security/fix-auth-user-fields-input.spec.ts` CA-6); no hay forma de
 *   reproducir el escenario en este entorno.
 * - CA-19 sólo se comprueba hasta donde da una respuesta HTTP (500 genérico
 *   sin detalles de Prisma); la redacción exacta de la línea `[invite-user]`
 *   en el log del api depende de leer la salida del proceso, no de una
 *   respuesta, así que esa parte queda [manual].
 */

function inviteRaw(context: APIRequestContext, body: Record<string, unknown>) {
  return context.post(`${API_BASE_URL}/user/invite`, { data: body });
}

async function countAccountWrites(fixture: LookupFixture) {
  const prisma = await getTestPrisma();
  const clinicIds = [fixture.clinicAId, fixture.clinicBId];

  const [memberships, doctorProfiles, invitations] = await Promise.all([
    prisma.userResourceMembership.count({ where: { accountId: fixture.account1.accountId } }),
    prisma.doctorProfile.count({ where: { clinicId: { in: clinicIds } } }),
    prisma.userInvitation.count({ where: { membership: { accountId: fixture.account1.accountId } } }),
  ]);

  return { memberships, doctorProfiles, invitations };
}

test.describe("Lo que debe seguir funcionando", () => {
  test("CA-3: administrador de la organización, sin membership directa en la sede, invita a un médico existente a otra sede", async () => {
    const fixture = await seedLookupFixture();
    const specialtyId = await createSpecialty(
      fixture.account1,
      fixture.organizationId,
      uniqueName("Especialidad CA3"),
    );

    const response = await inviteRaw(fixture.account1.context, {
      email: fixture.doctor.email,
      name: fixture.doctor.name,
      lastName: fixture.doctor.lastName,
      phone: fixture.doctor.phone,
      role: "DOCTOR",
      resourceId: fixture.clinicBId,
      specialtyIds: [specialtyId],
    });

    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const membership = await prisma.userResourceMembership.findFirst({
      where: { userId: fixture.doctor.userId, resourceId: fixture.clinicBId },
    });
    expect(membership?.role).toBe("DOCTOR");
  });

  test("CA-4: el administrador de una sede invita un USER a ella y nombra a otro ADMIN de la misma sede", async () => {
    const fixture = await seedLookupFixture();

    const userResponse = await inviteRaw(fixture.adminOfClinicA.context, {
      email: uniqueEmail("nuevo-user-ca4"),
      name: "Nuevo",
      lastName: "Usuario",
      phone: "+51900000004",
      role: "USER",
      resourceId: fixture.clinicAId,
    });
    expect(userResponse.status()).toBe(200);

    const adminResponse = await inviteRaw(fixture.adminOfClinicA.context, {
      email: uniqueEmail("nuevo-admin-ca4"),
      name: "Nuevo",
      lastName: "Admin",
      phone: "+51900000005",
      role: "ADMIN",
      resourceId: fixture.clinicAId,
    });
    expect(adminResponse.status()).toBe(200);
  });

  test("CA-5: con el plan al tope de médicos, invitar a otro médico responde 402 con el mensaje del plan", async () => {
    const fixture = await seedLookupFixture();
    const specialtyId = await createSpecialty(
      fixture.account1,
      fixture.organizationId,
      uniqueName("Especialidad CA5"),
    );

    // fixture.doctor ya ocupa la única plaza del plan Gratis.
    const response = await inviteRaw(fixture.account1.context, {
      email: uniqueEmail("segundo-doctor-ca5"),
      name: "Segundo",
      lastName: "Doctor",
      phone: "+51900000006",
      role: "DOCTOR",
      resourceId: fixture.clinicAId,
      specialtyIds: [specialtyId],
    });

    expect(response.status()).toBe(402);
    expect((await response.json()).message).toContain("médicos");
  });

  test("CA-6: invitar un correo que ya tiene cuenta en otra cuenta responde 422", async () => {
    const fixture = await seedLookupFixture();

    const response = await inviteRaw(fixture.account1.context, {
      email: fixture.account2.email,
      name: "X",
      lastName: "Y",
      phone: "+51900000007",
      role: "USER",
      resourceId: fixture.clinicAId,
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).message).toBe(
      "Ya existe una cuenta con este correo en otra cuenta",
    );
  });

  test("CA-17: una petición sin sesión no cambia de rechazo y no escribe nada", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);
    const anonymous = await createApiContext();

    const response = await inviteRaw(anonymous, {
      email: uniqueEmail("sin-sesion-ca17"),
      name: "X",
      lastName: "Y",
      phone: "+51900000017",
      role: "USER",
      resourceId: fixture.clinicAId,
    });

    expect(response.status()).not.toBe(200);
    expect(await countAccountWrites(fixture)).toEqual(before);
  });
});

test.describe("Lo que deja de ser posible", () => {
  test("CA-8: recepción (USER) se autoinvita a otra sede como ADMIN, DOCTOR o USER: 403 en los tres y sin escrituras", async () => {
    const fixture = await seedLookupFixture();
    const specialtyId = await createSpecialty(
      fixture.account1,
      fixture.organizationId,
      uniqueName("Especialidad CA8"),
    );
    const before = await countAccountWrites(fixture);

    for (const role of ["ADMIN", "DOCTOR", "USER"] as const) {
      const response = await inviteRaw(fixture.reception.context, {
        email: fixture.reception.email,
        name: fixture.reception.name,
        lastName: fixture.reception.lastName,
        phone: fixture.reception.phone,
        role,
        resourceId: fixture.clinicBId,
        // DOCTOR exige specialtyIds en la validación del body, antes de
        // llegar al caso de uso: sin esto, ese intento daría 400, no 403.
        specialtyIds: role === "DOCTOR" ? [specialtyId] : undefined,
      });
      expect(response.status(), role).toBe(403);
      expect((await response.json()).message, role).toBe(
        "Sólo un administrador de la sede puede invitar usuarios",
      );
    }

    expect(await countAccountWrites(fixture)).toEqual(before);

    const usersResponse = await fixture.reception.context.get(
      `${API_BASE_URL}/clinic/${fixture.clinicBId}/users`,
    );
    expect(usersResponse.status()).toBe(404);
  });

  test("CA-9: recepción invita a un tercero como ADMIN de su propia sede: 403 y sin escrituras", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    const response = await inviteRaw(fixture.reception.context, {
      email: uniqueEmail("tercero-ca9"),
      name: "Tercero",
      lastName: "Ajeno",
      phone: "+51900000009",
      role: "ADMIN",
      resourceId: fixture.clinicAId,
    });

    expect(response.status()).toBe(403);
    expect(await countAccountWrites(fixture)).toEqual(before);
  });

  test("CA-10: el médico (DOCTOR) se autoinvita como ADMIN de otra sede, e invita a un tercero como USER de la suya: 403 en ambos y sin escrituras", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    const selfAdminResponse = await inviteRaw(fixture.doctor.context, {
      email: fixture.doctor.email,
      name: fixture.doctor.name,
      lastName: fixture.doctor.lastName,
      phone: fixture.doctor.phone,
      role: "ADMIN",
      resourceId: fixture.clinicBId,
    });
    expect(selfAdminResponse.status()).toBe(403);

    const thirdPartyResponse = await inviteRaw(fixture.doctor.context, {
      email: uniqueEmail("tercero-ca10"),
      name: "Tercero",
      lastName: "Ajeno",
      phone: "+51900000010",
      role: "USER",
      resourceId: fixture.clinicAId,
    });
    expect(thirdPartyResponse.status()).toBe(403);

    expect(await countAccountWrites(fixture)).toEqual(before);
  });

  test("CA-11: un administrador de la sede A, que no lo es de B ni de la organización, invita a alguien a B: 403 y sin escrituras", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    const response = await inviteRaw(fixture.adminOfClinicA.context, {
      email: uniqueEmail("ajeno-ca11"),
      name: "Ajeno",
      lastName: "Ajeno",
      phone: "+51900000011",
      role: "USER",
      resourceId: fixture.clinicBId,
    });

    expect(response.status()).toBe(403);
    expect(await countAccountWrites(fixture)).toEqual(before);
  });

  test("CA-12: un miembro con rol heredado de la organización (sin membership directa en la sede destino) se autoinvita como ADMIN: 403 y sin escrituras", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    // El doctor sólo tiene membership directa en A; en B no tiene ninguna
    // (ni directa ni ADMIN), sólo el acceso heredado de ser miembro de la
    // organización que no cuenta para `assertInviterIsAdmin`.
    const response = await inviteRaw(fixture.doctor.context, {
      email: fixture.doctor.email,
      name: fixture.doctor.name,
      lastName: fixture.doctor.lastName,
      phone: fixture.doctor.phone,
      role: "ADMIN",
      resourceId: fixture.clinicBId,
    });

    expect(response.status()).toBe(403);
    expect(await countAccountWrites(fixture)).toEqual(before);
  });

  test("CA-13: una membership ADMIN borrada (deletedAt) ya no autoriza a invitar: 403", async () => {
    const fixture = await seedLookupFixture();
    const prisma = await getTestPrisma();

    const membership = await prisma.userResourceMembership.findFirst({
      where: { userId: fixture.adminOfClinicA.userId, resourceId: fixture.clinicAId },
    });
    if (!membership) throw new Error("No se encontró la membership ADMIN de control");

    await prisma.userResourceMembership.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    });

    try {
      const response = await inviteRaw(fixture.adminOfClinicA.context, {
        email: uniqueEmail("ca13"),
        name: "X",
        lastName: "Y",
        phone: "+51900000013",
        role: "USER",
        resourceId: fixture.clinicAId,
      });

      expect(response.status()).toBe(403);
    } finally {
      await prisma.userResourceMembership.update({
        where: { id: membership.id },
        data: { deletedAt: null },
      });
    }
  });

  test("CA-14: un administrador de otra cuenta, con el resourceId de esta, recibe 404 y no escribe nada", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    const response = await inviteRaw(fixture.account2.context, {
      email: uniqueEmail("ca14"),
      name: "X",
      lastName: "Y",
      phone: "+51900000014",
      role: "USER",
      resourceId: fixture.clinicAId,
    });

    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Sede no encontrada");
    expect(await countAccountWrites(fixture)).toEqual(before);
  });

  test("CA-16: un resourceId que es una organización o que no existe responde 404", async () => {
    const fixture = await seedLookupFixture();

    const organizationResponse = await inviteRaw(fixture.account1.context, {
      email: uniqueEmail("ca16-org"),
      name: "X",
      lastName: "Y",
      phone: "+51900000016",
      role: "USER",
      resourceId: fixture.organizationId,
    });
    expect(organizationResponse.status()).toBe(404);
    expect((await organizationResponse.json()).message).toBe("Sede no encontrada");

    const missingResponse = await inviteRaw(fixture.account1.context, {
      email: uniqueEmail("ca16-missing"),
      name: "X",
      lastName: "Y",
      phone: "+51900000018",
      role: "USER",
      resourceId: randomUUID(),
    });
    expect(missingResponse.status()).toBe(404);
    expect((await missingResponse.json()).message).toBe("Sede no encontrada");
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-18: recepción y médico reciben el mismo 403 al sondear un correo de otra cuenta y uno inexistente, sin crear usuarios ni invitaciones", async () => {
    const fixture = await seedLookupFixture();
    const before = await countAccountWrites(fixture);

    const existingEmail = fixture.account2.email;
    const nonExistentEmail = uniqueEmail("no-existe-ca18");

    const responses = await Promise.all(
      [fixture.reception, fixture.doctor].flatMap((actor) =>
        [existingEmail, nonExistentEmail].map((email) =>
          inviteRaw(actor.context, {
            email,
            name: "X",
            lastName: "Y",
            phone: "+51900000018",
            role: "USER",
            resourceId: fixture.clinicAId,
          }),
        ),
      ),
    );

    const bodies = await Promise.all(responses.map((response) => response.json()));
    for (const response of responses) {
      expect(response.status()).toBe(403);
    }
    for (const body of bodies) {
      expect(body).toEqual(bodies[0]);
    }

    expect(await countAccountWrites(fixture)).toEqual(before);
    const prisma = await getTestPrisma();
    expect(await prisma.user.findUnique({ where: { email: nonExistentEmail } })).toBeNull();
  });

  test("CA-19 (parcial): un error interno no filtra detalles de Prisma en la respuesta", async () => {
    const fixture = await seedLookupFixture();

    // Reinvitar a la misma persona a la misma sede choca con el único (userId, resourceId): P2002 → 500 genérico.
    const response = await inviteRaw(fixture.account1.context, {
      email: fixture.reception.email,
      name: fixture.reception.name,
      lastName: fixture.reception.lastName,
      phone: fixture.reception.phone,
      role: "USER",
      resourceId: fixture.clinicAId,
    });

    expect(response.status()).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ message: "Ha ocurrido un error al invitar al usuario" });
    const rawBody = JSON.stringify(body);
    expect(rawBody).not.toContain(fixture.reception.email);
    expect(rawBody).not.toContain(fixture.reception.phone);
    expect(rawBody.toLowerCase()).not.toContain("prisma");
  });

  test("CA-20: una invitación exitosa no deja memberships con una cuenta distinta de la de su recurso", async () => {
    const fixture = await seedLookupFixture();

    const response = await inviteRaw(fixture.adminOfClinicA.context, {
      email: uniqueEmail("ca20"),
      name: "X",
      lastName: "Y",
      phone: "+51900000020",
      role: "USER",
      resourceId: fixture.clinicAId,
    });
    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const mismatches = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::int AS count
      FROM user_resource_membership m
      JOIN resource r ON r.id = m.resource_id
      WHERE m.account_id <> r.account_id
        AND m.account_id = ${fixture.account1.accountId}::uuid
    `;
    expect(Number(mismatches[0].count)).toBe(0);
  });
});
