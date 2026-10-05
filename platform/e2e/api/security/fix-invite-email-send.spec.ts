import { randomUUID } from "node:crypto";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readLatestEmailTo } from "../../support/email";
import { uniqueName } from "../../support/users";

/** docs/features/fix-invite-email-send/plan.md — CA-1 a CA-5 ([e2e]); CA-6 y CA-7 son [manual] (requieren SES real). */

function inviteBody(
  resourceId: string,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: "Ana",
    lastName: "Pérez",
    phone: "+51999777666",
    role: "USER",
    resourceId,
    ...overrides,
  };
}

function uniqueMixedCaseEmail(prefix: string): string {
  const unique = `${Date.now()}.${randomUUID().slice(0, 8)}`;
  return `${prefix}.${unique}@E2E.wizydoc.test`;
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1 y CA-2: un correo inválido en POST /user/invite responde 400 sin crear nada, y el api sigue vivo", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca1" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA1"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-1"),
    });
    const specialtyId = await createSpecialty(
      admin,
      organizationId,
      uniqueName("Especialidad CA-1"),
    );

    const invalidEmail = "no-es-un-correo";
    const response = await admin.context.post(`${API_BASE_URL}/user/invite`, {
      data: inviteBody(clinicId, {
        email: invalidEmail,
        role: "DOCTOR",
        specialtyIds: [specialtyId],
      }),
    });

    expect(response.status()).toBe(400);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({
      where: { email: invalidEmail },
    });
    expect(user).toBeNull();

    const memberships = await prisma.userResourceMembership.findMany({
      where: { resourceId: clinicId },
    });
    expect(memberships).toHaveLength(0);

    const doctorProfiles = await prisma.doctorProfile.findMany({
      where: { clinicId },
    });
    expect(doctorProfiles).toHaveLength(0);

    // La invitación depende de una membership ya creada (FK a membershipId): sin membership, tampoco hay invitación.
    const invitations = await prisma.userInvitation.findMany({
      where: { invitedBy: admin.userId },
    });
    expect(invitations).toHaveLength(0);

    // CA-2: la misma sesión del ADMIN sigue respondiendo tras el 400.
    const meResponse = await admin.context.get(`${API_BASE_URL}/user/me`);
    expect(meResponse.status()).toBe(200);
  });
});

test.describe("Normalización de correo", () => {
  test("CA-3: invitar con mayúsculas guarda el usuario en minúsculas y el correo capturado llega a esa dirección en minúsculas", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca3" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA3"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-3"),
    });

    const mixedCaseEmail = uniqueMixedCaseEmail("Ana.Perez");
    const normalizedEmail = mixedCaseEmail.toLowerCase();

    const response = await admin.context.post(`${API_BASE_URL}/user/invite`, {
      data: inviteBody(clinicId, { email: mixedCaseEmail }),
    });

    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(normalizedEmail);

    await expect.poll(() => readLatestEmailTo(normalizedEmail)).toBeDefined();
    expect(readLatestEmailTo(mixedCaseEmail)).toBeUndefined();
  });

  test("CA-4: invitar con mayúsculas el correo de un usuario de otra cuenta se rechaza igual que en minúsculas, sin duplicarlo", async () => {
    const victim = await createOnboardedAdmin({
      emailPrefix: "ana-otra-cuenta-ca4",
      name: "Ana",
      lastName: "Externa",
    });

    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA4"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-4"),
    });

    const lowercaseResponse = await admin.context.post(
      `${API_BASE_URL}/user/invite`,
      {
        data: inviteBody(clinicId, { email: victim.email }),
      },
    );
    const upperCaseEmail = victim.email.toUpperCase();
    const uppercaseResponse = await admin.context.post(
      `${API_BASE_URL}/user/invite`,
      {
        data: inviteBody(clinicId, { email: upperCaseEmail }),
      },
    );

    expect(lowercaseResponse.status()).toBe(422);
    expect(uppercaseResponse.status()).toBe(lowercaseResponse.status());
    expect(await uppercaseResponse.json()).toEqual(
      await lowercaseResponse.json(),
    );

    const prisma = await getTestPrisma();
    const userByLiteralUppercaseEmail = await prisma.user.findUnique({
      where: { email: upperCaseEmail },
    });
    expect(userByLiteralUppercaseEmail).toBeNull();

    const normalizedUser = await prisma.user.findUnique({
      where: { email: upperCaseEmail.toLowerCase() },
    });
    expect(normalizedUser?.id).toBe(victim.userId);

    const membershipsForVictimOnAdminResource =
      await prisma.userResourceMembership.findMany({
        where: { resourceId: clinicId, userId: victim.userId },
      });
    expect(membershipsForVictimOnAdminResource).toHaveLength(0);
  });
});
