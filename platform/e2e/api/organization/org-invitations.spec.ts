import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeededMember,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { readLatestEmailTo } from "../../support/email";
import { softDeleteMembership } from "../../support/invitations";
import {
  authPost,
  E2E_PASSWORD,
  signIn,
  uniqueEmail,
  uniqueName,
} from "../../support/users";

const NONEXISTENT_RESOURCE_ID = "00000000-0000-7000-8000-000000000000";
const NOT_FOUND_RESOURCE_MESSAGE = "Resource not found";
const NOT_FOUND_ORGANIZATION_MESSAGE = "Organización no encontrada";
const INVITATION_SENT_MESSAGE = "Se ha enviado la invitación al usuario";
const INVITATION_SUBJECT = "WizyDoc - Invitación";

function inviteBody(email: string, overrides: Record<string, unknown> = {}) {
  return {
    email,
    name: "Marta",
    lastName: "Quispe",
    phone: "+51999777666",
    role: "USER",
    ...overrides,
  };
}

function postOrganizationInvitation(
  context: APIRequestContext,
  resourceId: string,
  body: Record<string, unknown>,
) {
  return context.post(
    `${API_BASE_URL}/organization/${resourceId}/invitations`,
    { data: body },
  );
}

function getOrganizationUsers(context: APIRequestContext, resourceId: string) {
  return context.get(`${API_BASE_URL}/organization/${resourceId}/users`);
}

function lookupOrganizationUser(
  context: APIRequestContext,
  resourceId: string,
  email: string,
) {
  return context.post(
    `${API_BASE_URL}/organization/${resourceId}/users/lookup`,
    { data: { email } },
  );
}

interface Fixture {
  admin: OnboardedAdmin;
  organizationId: string;
  organizationName: string;
  clinicAId: string;
  clinicBId: string;
  userOfOrganization: SeededMember;
  adminOfClinic: SeededMember;
  doctorOfClinic: SeededMember;
  otherAccountAdmin: OnboardedAdmin;
  otherOrganizationId: string;
}

async function setupFixture(): Promise<Fixture> {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-orginv" });
  const organizationName = uniqueName("ORG-INV");
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );
  const clinicAId = await createClinicResource(admin, organizationId, {
    name: uniqueName("Sede A"),
  });
  // Por Prisma: el plan Gratis limita a una sede por cuenta.
  const clinicBId = await createClinicResourceViaPrisma(admin, organizationId, {
    name: uniqueName("Sede B"),
  });

  const userOfOrganization = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: organizationId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "user-org",
  });
  const adminOfClinic = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicAId,
    role: "ADMIN",
    createdBy: admin.userId,
    emailPrefix: "admin-sede",
  });
  const doctorOfClinic = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicAId,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: "doctor-sede",
  });

  const otherAccountAdmin = await createOnboardedAdmin({
    emailPrefix: "otro-admin-orginv",
  });
  const otherOrganizationId = await createOrganizationResource(
    otherAccountAdmin,
    uniqueName("ORG-OTRA"),
  );

  return {
    admin,
    organizationId,
    organizationName,
    clinicAId,
    clinicBId,
    userOfOrganization,
    adminOfClinic,
    doctorOfClinic,
    otherAccountAdmin,
    otherOrganizationId,
  };
}

async function writeCounts(accountIds: string[]) {
  const prisma = await getTestPrisma();
  const [users, memberships, invitations, doctorProfiles] = await Promise.all([
    prisma.user.count({ where: { accountId: { in: accountIds } } }),
    prisma.userResourceMembership.count({
      where: { accountId: { in: accountIds } },
    }),
    prisma.userInvitation.count({
      where: { membership: { accountId: { in: accountIds } } },
    }),
    prisma.doctorProfile.count({
      where: { user: { accountId: { in: accountIds } } },
    }),
  ]);
  return { users, memberships, invitations, doctorProfiles };
}

async function acceptInvitationByEmail(email: string) {
  const prisma = await getTestPrisma();
  const invitation = await prisma.userInvitation.findFirst({
    where: { membership: { user: { email } } },
  });
  if (!invitation) throw new Error(`No hay invitación para ${email}`);

  const context = await createApiContext();
  const response = await authPost(context, "/invitations/set-password", {
    token: invitation.token,
    password: E2E_PASSWORD,
  });
  expect(response.status()).toBe(200);
  await signIn(context, email);
  return context;
}

test.describe("Invitar a la organización", () => {
  test("el ADMIN de la organización invita a un USER y a un ADMIN: membership directa, invitación pendiente y correo con el nombre de la organización", async () => {
    const fixture = await setupFixture();
    const prisma = await getTestPrisma();

    for (const role of ["USER", "ADMIN"] as const) {
      const email = uniqueEmail(`invitado-${role.toLowerCase()}`);
      const response = await postOrganizationInvitation(
        fixture.admin.context,
        fixture.organizationId,
        inviteBody(email, { role }),
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({
        message: INVITATION_SENT_MESSAGE,
      });

      const membership = await prisma.userResourceMembership.findFirst({
        where: {
          user: { email },
          resourceId: fixture.organizationId,
          role,
          accountId: fixture.admin.accountId,
          deletedAt: null,
        },
      });
      expect(membership).not.toBeNull();
      const invitation = await prisma.userInvitation.findFirst({
        where: { membershipId: membership!.id },
      });
      expect(invitation?.status).toBe("INVITED");

      await expect
        .poll(() => readLatestEmailTo(email)?.subject)
        .toBe(INVITATION_SUBJECT);
      const html = readLatestEmailTo(email)!.html;
      expect(html).toContain(fixture.organizationName);
    }
  });

  test("quien acepta como ADMIN entra a la organización y a sus sedes; quien acepta como USER ve las sedes heredadas y no entra a la organización", async () => {
    const fixture = await setupFixture();

    const adminEmail = uniqueEmail("hereda-admin");
    const userEmail = uniqueEmail("hereda-user");
    expect(
      (
        await postOrganizationInvitation(
          fixture.admin.context,
          fixture.organizationId,
          inviteBody(adminEmail, { role: "ADMIN" }),
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await postOrganizationInvitation(
          fixture.admin.context,
          fixture.organizationId,
          inviteBody(userEmail, { role: "USER" }),
        )
      ).status(),
    ).toBe(200);

    const invitedAdmin = await acceptInvitationByEmail(adminEmail);
    const clinicsResponse = await invitedAdmin.get(
      `${API_BASE_URL}/organization/${fixture.organizationId}/clinics`,
    );
    expect(clinicsResponse.status()).toBe(200);
    const inviteToClinic = await invitedAdmin.post(
      `${API_BASE_URL}/clinic/${fixture.clinicAId}/invitations`,
      { data: inviteBody(uniqueEmail("desde-sede")) },
    );
    expect(inviteToClinic.status()).toBe(200);

    const invitedUser = await acceptInvitationByEmail(userEmail);
    const membershipsResponse = await invitedUser.get(
      `${API_BASE_URL}/user/me/memberships`,
    );
    expect(membershipsResponse.status()).toBe(200);
    const { memberships } = (await membershipsResponse.json()) as {
      memberships: {
        organization: { resourceId: string };
        clinics: { resourceId: string; accessVia: string }[];
      }[];
    };
    const organizationMembership = memberships.find(
      (membership) =>
        membership.organization.resourceId === fixture.organizationId,
    );
    expect(organizationMembership).toBeDefined();
    const inheritedClinicIds = organizationMembership!.clinics
      .filter((clinic) => clinic.accessVia === "INHERITED_FROM_ORG")
      .map((clinic) => clinic.resourceId);
    expect(inheritedClinicIds).toEqual(
      expect.arrayContaining([fixture.clinicAId, fixture.clinicBId]),
    );
    expect(
      (
        await getOrganizationUsers(invitedUser, fixture.organizationId)
      ).status(),
    ).toBe(403);
  });

  test("un usuario que ya existe en la cuenta puede ser invitado como USER o ADMIN y conserva sus memberships", async () => {
    const fixture = await setupFixture();

    for (const role of ["USER", "ADMIN"] as const) {
      const existing = await createMemberWithRole({
        accountId: fixture.admin.accountId,
        resourceId: fixture.clinicAId,
        role: "USER",
        createdBy: fixture.admin.userId,
        emailPrefix: `existente-${role.toLowerCase()}`,
      });

      const response = await postOrganizationInvitation(
        fixture.admin.context,
        fixture.organizationId,
        inviteBody(existing.email, { role }),
      );
      expect(response.status()).toBe(200);

      const prisma = await getTestPrisma();
      const memberships = (await prisma.userResourceMembership.findMany({
        where: { userId: existing.userId, deletedAt: null },
      })) as { resourceId: string; role: string }[];
      expect(memberships.map((m) => [m.resourceId, m.role]).sort()).toEqual(
        [
          [fixture.clinicAId, "USER"],
          [fixture.organizationId, role],
        ].sort(),
      );
    }
  });

  test("el rol DOCTOR se rechaza con 400 en el campo role y no se escribe nada", async () => {
    const fixture = await setupFixture();
    const accountIds = [fixture.admin.accountId];
    const before = await writeCounts(accountIds);
    const email = uniqueEmail("doctor-org");

    const response = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.organizationId,
      inviteBody(email, { role: "DOCTOR" }),
    );

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("role");
    expect(await writeCounts(accountIds)).toEqual(before);
    expect(readLatestEmailTo(email)).toBeUndefined();
  });

  test("specialtyIds con rol USER se ignora: 200 y sin perfil de doctor", async () => {
    const fixture = await setupFixture();
    const specialtyId = await createSpecialty(
      fixture.admin,
      fixture.organizationId,
    );
    const email = uniqueEmail("usuario-especialidad");

    const response = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.organizationId,
      inviteBody(email, { specialtyIds: [specialtyId] }),
    );
    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(
      await prisma.doctorProfile.count({ where: { userId: user!.id } }),
    ).toBe(0);
  });
});

test.describe("Rechazos y aislamiento al invitar a la organización", () => {
  test("ADMIN de sede, USER, DOCTOR, intruso de otra cuenta, membership borrada y sin sesión no invitan y no escriben nada", async () => {
    const fixture = await setupFixture();
    const deletedAdmin = await createMemberWithRole({
      accountId: fixture.admin.accountId,
      resourceId: fixture.organizationId,
      role: "ADMIN",
      createdBy: fixture.admin.userId,
      emailPrefix: "admin-borrado",
    });
    await softDeleteMembership(deletedAdmin.membershipId);

    const accountIds = [
      fixture.admin.accountId,
      fixture.otherAccountAdmin.accountId,
    ];
    const before = await writeCounts(accountIds);

    const attempts: {
      context: APIRequestContext;
      status: number;
      message?: string;
    }[] = [
      {
        context: fixture.adminOfClinic.context,
        status: 404,
        message: NOT_FOUND_RESOURCE_MESSAGE,
      },
      { context: fixture.userOfOrganization.context, status: 403 },
      {
        context: fixture.doctorOfClinic.context,
        status: 404,
        message: NOT_FOUND_RESOURCE_MESSAGE,
      },
      {
        context: fixture.otherAccountAdmin.context,
        status: 404,
        message: NOT_FOUND_RESOURCE_MESSAGE,
      },
      {
        context: deletedAdmin.context,
        status: 404,
        message: NOT_FOUND_RESOURCE_MESSAGE,
      },
      { context: await createApiContext(), status: 401 },
    ];

    for (const attempt of attempts) {
      const email = uniqueEmail("rechazado");
      const response = await postOrganizationInvitation(
        attempt.context,
        fixture.organizationId,
        inviteBody(email),
      );
      expect(response.status()).toBe(attempt.status);
      if (attempt.message) {
        expect((await response.json()).message).toBe(attempt.message);
      }
      expect(readLatestEmailTo(email)).toBeUndefined();
    }

    expect(await writeCounts(accountIds)).toEqual(before);
  });

  test("el id de una sede, de otra cuenta, inexistente o que no es UUID se rechaza sin escribir", async () => {
    const fixture = await setupFixture();
    const accountIds = [
      fixture.admin.accountId,
      fixture.otherAccountAdmin.accountId,
    ];
    const before = await writeCounts(accountIds);

    const clinicResponse = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.clinicAId,
      inviteBody(uniqueEmail("sede-en-org")),
    );
    expect(clinicResponse.status()).toBe(404);
    expect((await clinicResponse.json()).message).toBe(
      NOT_FOUND_ORGANIZATION_MESSAGE,
    );

    const foreignResponse = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.otherOrganizationId,
      inviteBody(uniqueEmail("org-ajena")),
    );
    expect(foreignResponse.status()).toBe(404);

    const otherAdminOnOurs = await postOrganizationInvitation(
      fixture.otherAccountAdmin.context,
      fixture.organizationId,
      inviteBody(uniqueEmail("admin-ajeno")),
    );
    expect(otherAdminOnOurs.status()).toBe(404);

    const missingResponse = await postOrganizationInvitation(
      fixture.admin.context,
      NONEXISTENT_RESOURCE_ID,
      inviteBody(uniqueEmail("inexistente")),
    );
    expect(missingResponse.status()).toBe(404);

    const notUuidResponse = await postOrganizationInvitation(
      fixture.admin.context,
      "no-es-uuid",
      inviteBody(uniqueEmail("no-uuid")),
    );
    expect(notUuidResponse.status()).toBe(400);

    expect(await writeCounts(accountIds)).toEqual(before);
  });

  test("un resourceId u organizationId en el cuerpo no redirige la escritura", async () => {
    const fixture = await setupFixture();
    const email = uniqueEmail("cuerpo-ajeno");

    const response = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.organizationId,
      inviteBody(email, {
        resourceId: fixture.otherOrganizationId,
        organizationId: fixture.otherOrganizationId,
      }),
    );
    expect(response.status()).toBe(200);

    const prisma = await getTestPrisma();
    const memberships = (await prisma.userResourceMembership.findMany({
      where: { user: { email } },
    })) as { resourceId: string }[];
    expect(memberships.map((m) => m.resourceId)).toEqual([
      fixture.organizationId,
    ]);
    expect(
      await prisma.userResourceMembership.count({
        where: {
          resourceId: fixture.otherOrganizationId,
          user: { email },
        },
      }),
    ).toBe(0);

    const unauthorized = await postOrganizationInvitation(
      fixture.otherAccountAdmin.context,
      fixture.organizationId,
      inviteBody(uniqueEmail("cuerpo-ajeno-2"), {
        resourceId: fixture.otherOrganizationId,
      }),
    );
    expect(unauthorized.status()).toBe(404);
  });

  test("invitar a un correo de un usuario de otra cuenta responde 422 sin escribir", async () => {
    const fixture = await setupFixture();
    const accountIds = [
      fixture.admin.accountId,
      fixture.otherAccountAdmin.accountId,
    ];
    const before = await writeCounts(accountIds);

    const response = await postOrganizationInvitation(
      fixture.admin.context,
      fixture.organizationId,
      inviteBody(fixture.otherAccountAdmin.email),
    );

    expect(response.status()).toBe(422);
    expect(await writeCounts(accountIds)).toEqual(before);
  });
});

test.describe("Plan", () => {
  test("con la plaza de médico ocupada en el plan Gratis, invitar un USER y un ADMIN a la organización sigue dando 200", async () => {
    const fixture = await setupFixture();

    // El fixture ya tiene un DOCTOR en la sede: la plaza de médico del plan Gratis está ocupada.
    const extraDoctor = await fixture.admin.context.post(
      `${API_BASE_URL}/clinic/${fixture.clinicAId}/invitations`,
      {
        data: inviteBody(uniqueEmail("medico-extra"), {
          role: "DOCTOR",
          specialtyIds: [
            await createSpecialty(fixture.admin, fixture.organizationId),
          ],
        }),
      },
    );
    expect(extraDoctor.status()).toBe(402);

    for (const role of ["USER", "ADMIN"]) {
      const response = await postOrganizationInvitation(
        fixture.admin.context,
        fixture.organizationId,
        inviteBody(uniqueEmail(`sin-plaza-${role.toLowerCase()}`), { role }),
      );
      expect(response.status()).toBe(200);
    }
  });
});

test.describe("Lista de usuarios de la organización", () => {
  test("el ADMIN ve sólo memberships directas y vivas, con el indicador de invitación pendiente y sin datos de la invitación", async () => {
    const fixture = await setupFixture();
    const deletedAdmin = await createMemberWithRole({
      accountId: fixture.admin.accountId,
      resourceId: fixture.organizationId,
      role: "ADMIN",
      createdBy: fixture.admin.userId,
      emailPrefix: "borrado-lista",
    });
    await softDeleteMembership(deletedAdmin.membershipId);

    const pendingEmail = uniqueEmail("pendiente");
    const acceptedEmail = uniqueEmail("aceptado");
    for (const email of [pendingEmail, acceptedEmail]) {
      const response = await postOrganizationInvitation(
        fixture.admin.context,
        fixture.organizationId,
        inviteBody(email),
      );
      expect(response.status()).toBe(200);
    }
    await acceptInvitationByEmail(acceptedEmail);

    const response = await getOrganizationUsers(
      fixture.admin.context,
      fixture.organizationId,
    );
    expect(response.status()).toBe(200);
    const rows = (await response.json()) as Record<string, unknown>[];

    const emails = rows.map((row) => row.email);
    expect(emails).toEqual(
      expect.arrayContaining([
        fixture.admin.email,
        fixture.userOfOrganization.email,
        pendingEmail,
        acceptedEmail,
      ]),
    );
    expect(emails).not.toContain(fixture.adminOfClinic.email);
    expect(emails).not.toContain(fixture.doctorOfClinic.email);
    expect(emails).not.toContain(deletedAdmin.email);
    expect(rows).toHaveLength(4);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "email",
        "hasPendingInvitation",
        "lastName",
        "name",
        "phone",
        "role",
      ]);
    }

    const byEmail = (email: string) => rows.find((row) => row.email === email);
    expect(byEmail(pendingEmail)?.hasPendingInvitation).toBe(true);
    expect(byEmail(acceptedEmail)?.hasPendingInvitation).toBe(false);
    expect(byEmail(fixture.admin.email)?.hasPendingInvitation).toBe(false);
    expect(byEmail(fixture.admin.email)?.role).toBe("ADMIN");
  });

  test("USER de la organización recibe 403; ADMIN de sede, ADMIN de otra cuenta y sin sesión no ven nada", async () => {
    const fixture = await setupFixture();

    const forbidden = await getOrganizationUsers(
      fixture.userOfOrganization.context,
      fixture.organizationId,
    );
    expect(forbidden.status()).toBe(403);

    for (const context of [
      fixture.adminOfClinic.context,
      fixture.otherAccountAdmin.context,
    ]) {
      const response = await getOrganizationUsers(
        context,
        fixture.organizationId,
      );
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain(fixture.admin.email);
    }

    const anonymous = await getOrganizationUsers(
      await createApiContext(),
      fixture.organizationId,
    );
    expect(anonymous.status()).toBe(401);
  });

  test("con el id de una sede la lista sale vacía", async () => {
    const fixture = await setupFixture();

    const response = await getOrganizationUsers(
      fixture.admin.context,
      fixture.clinicAId,
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

test.describe("Búsqueda por correo en la organización", () => {
  test("el ADMIN recibe sólo name, lastName y phone de un usuario de la cuenta y null para uno de otra cuenta o inexistente", async () => {
    const fixture = await setupFixture();

    const own = await lookupOrganizationUser(
      fixture.admin.context,
      fixture.organizationId,
      fixture.doctorOfClinic.email,
    );
    expect(own.status()).toBe(200);
    expect(await own.json()).toEqual({
      user: {
        name: fixture.doctorOfClinic.name,
        lastName: fixture.doctorOfClinic.lastName,
        phone: fixture.doctorOfClinic.phone,
      },
    });

    for (const email of [
      fixture.otherAccountAdmin.email,
      uniqueEmail("no-existe"),
    ]) {
      const response = await lookupOrganizationUser(
        fixture.admin.context,
        fixture.organizationId,
        email,
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ user: null });
    }
  });

  test("el correo se busca sin distinguir mayúsculas", async () => {
    const fixture = await setupFixture();

    const response = await lookupOrganizationUser(
      fixture.admin.context,
      fixture.organizationId,
      fixture.doctorOfClinic.email.toUpperCase(),
    );

    expect(response.status()).toBe(200);
    expect((await response.json()).user).toEqual({
      name: fixture.doctorOfClinic.name,
      lastName: fixture.doctorOfClinic.lastName,
      phone: fixture.doctorOfClinic.phone,
    });
  });

  test("USER de la organización recibe 403, ADMIN de otra cuenta 404 y sin sesión 401", async () => {
    const fixture = await setupFixture();

    expect(
      (
        await lookupOrganizationUser(
          fixture.userOfOrganization.context,
          fixture.organizationId,
          fixture.admin.email,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await lookupOrganizationUser(
          fixture.otherAccountAdmin.context,
          fixture.organizationId,
          fixture.admin.email,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await lookupOrganizationUser(
          await createApiContext(),
          fixture.organizationId,
          fixture.admin.email,
        )
      ).status(),
    ).toBe(401);
  });
});

test.describe("La ruta de sede no cambia", () => {
  test("invitar con el id de una organización en la ruta de sede sigue dando 404 Sede no encontrada, y con un UUID inexistente 404 Resource not found", async () => {
    const fixture = await setupFixture();

    const organizationResponse = await fixture.admin.context.post(
      `${API_BASE_URL}/clinic/${fixture.organizationId}/invitations`,
      { data: inviteBody(uniqueEmail("ruta-sede")) },
    );
    expect(organizationResponse.status()).toBe(404);
    expect((await organizationResponse.json()).message).toBe(
      "Sede no encontrada",
    );

    const missingResponse = await fixture.admin.context.post(
      `${API_BASE_URL}/clinic/${NONEXISTENT_RESOURCE_ID}/invitations`,
      { data: inviteBody(uniqueEmail("ruta-sede-inexistente")) },
    );
    expect(missingResponse.status()).toBe(404);
    expect((await missingResponse.json()).message).toBe(
      NOT_FOUND_RESOURCE_MESSAGE,
    );
  });
});
