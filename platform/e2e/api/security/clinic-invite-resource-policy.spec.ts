import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { uniqueEmail, uniqueName } from "../../support/users";

const clinicBody = () => ({
  name: uniqueName("Sede"),
  phone: "+51999888777",
  address: "Av. Siempre Viva 123",
});

const inviteBody = (email: string) => ({
  email,
  name: "Ana",
  lastName: "Pérez",
  phone: "+51999777666",
  role: "USER",
});

function postClinic(
  context: APIRequestContext,
  organizationId: string,
  extraBody: Record<string, unknown> = {},
) {
  return context.post(
    `${API_BASE_URL}/organization/${organizationId}/clinics`,
    {
      data: { ...clinicBody(), ...extraBody },
    },
  );
}

function postInvitation(
  context: APIRequestContext,
  clinicId: string,
  email: string,
  extraBody: Record<string, unknown> = {},
) {
  return context.post(`${API_BASE_URL}/clinic/${clinicId}/invitations`, {
    data: { ...inviteBody(email), ...extraBody },
  });
}

async function writeCounts(accountId: string) {
  const prisma = await getTestPrisma();
  const [clinics, memberships, invitations] = await Promise.all([
    prisma.resource.count({ where: { accountId, type: "CLINIC" } }),
    prisma.userResourceMembership.count({ where: { accountId } }),
    prisma.userInvitation.count({ where: { membership: { accountId } } }),
  ]);
  return { clinics, memberships, invitations };
}

async function clinicsUnder(organizationId: string) {
  const prisma = await getTestPrisma();
  return prisma.resource.count({
    where: { parentResourceId: organizationId, type: "CLINIC" },
  });
}

test.describe("Rutas viejas", () => {
  test("POST /clinic y POST /user/invite ya no existen: responden 401 y no escriben nada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-viejas" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-VIEJAS"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede viejas"),
    });
    const before = await writeCounts(admin.accountId);
    const invitedEmail = uniqueEmail("viejas");

    const clinicResponse = await admin.context.post(`${API_BASE_URL}/clinic`, {
      data: { ...clinicBody(), organizationId },
    });
    expect(clinicResponse.status()).toBe(401);

    const inviteResponse = await admin.context.post(
      `${API_BASE_URL}/user/invite`,
      { data: { ...inviteBody(invitedEmail), resourceId: clinicId } },
    );
    expect(inviteResponse.status()).toBe(401);

    expect(await writeCounts(admin.accountId)).toEqual(before);
    const prisma = await getTestPrisma();
    expect(
      await prisma.user.findUnique({ where: { email: invitedEmail } }),
    ).toBeNull();
  });
});

test.describe("Un id en el cuerpo no redirige la escritura", () => {
  test("crear sede con el organizationId de otra organización de la cuenta en el cuerpo: cuelga de la de la URL", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-cuerpo-a" });
    const organizationAId = await createOrganizationResource(
      admin,
      uniqueName("ORG-A"),
    );
    const organizationBId = await createOrganizationResource(
      admin,
      uniqueName("ORG-B"),
    );

    const response = await postClinic(admin.context, organizationAId, {
      organizationId: organizationBId,
    });

    expect(response.status()).toBe(201);
    expect(await clinicsUnder(organizationAId)).toBe(1);
    expect(await clinicsUnder(organizationBId)).toBe(0);
  });

  test("crear sede con el organizationId de una organización de otra cuenta en el cuerpo: no escribe en la otra cuenta", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-cuerpo-b" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-PROPIA"),
    );
    const otherAccount = await createOnboardedAdmin({
      emailPrefix: "otra-cuerpo-b",
    });
    const otherOrganizationId = await createOrganizationResource(
      otherAccount,
      uniqueName("ORG-OTRA"),
    );
    const otherBefore = await writeCounts(otherAccount.accountId);

    const response = await postClinic(admin.context, organizationId, {
      organizationId: otherOrganizationId,
    });

    expect(response.status()).toBe(201);
    expect(await clinicsUnder(organizationId)).toBe(1);
    expect(await clinicsUnder(otherOrganizationId)).toBe(0);
    expect(await writeCounts(otherAccount.accountId)).toEqual(otherBefore);
  });

  test("invitar con el resourceId de otra sede en el cuerpo: la membership queda en la sede de la URL", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-cuerpo-c" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-C"),
    );
    const firstClinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede 1"),
    });
    const secondClinicId = await createClinicResourceViaPrisma(
      admin,
      organizationId,
      { name: uniqueName("Sede 2") },
    );
    const invitedEmail = uniqueEmail("cuerpo-c");

    const response = await postInvitation(
      admin.context,
      firstClinicId,
      invitedEmail,
      { resourceId: secondClinicId },
    );

    expect(response.status()).toBe(200);
    const prisma = await getTestPrisma();
    const invited = await prisma.user.findUnique({
      where: { email: invitedEmail },
    });
    if (!invited) throw new Error("No se creó el usuario invitado");
    expect(
      await prisma.userResourceMembership.count({
        where: { userId: invited.id, resourceId: firstClinicId },
      }),
    ).toBe(1);
    expect(
      await prisma.userResourceMembership.count({
        where: { userId: invited.id, resourceId: secondClinicId },
      }),
    ).toBe(0);
  });
});

test.describe("Id que no es UUID", () => {
  test("responde 400 en las dos rutas y no escribe nada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-uuid" });
    await createOrganizationResource(admin, uniqueName("ORG-UUID"));
    const before = await writeCounts(admin.accountId);
    const invitedEmail = uniqueEmail("uuid");

    const clinicResponse = await postClinic(admin.context, "no-es-uuid");
    expect(clinicResponse.status()).toBe(400);

    const inviteResponse = await postInvitation(
      admin.context,
      "no-es-uuid",
      invitedEmail,
    );
    expect(inviteResponse.status()).toBe(400);

    expect(await writeCounts(admin.accountId)).toEqual(before);
    const prisma = await getTestPrisma();
    expect(
      await prisma.user.findUnique({ where: { email: invitedEmail } }),
    ).toBeNull();
  });
});

test.describe("Membership borrada", () => {
  test("un ADMIN de organización con deletedAt no puede crear sedes: 404 y sin escrituras", async () => {
    const admin = await createOnboardedAdmin({
      emailPrefix: "admin-borrada-a",
    });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-BORRADA"),
    );
    const adminMember = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminorg-borrada",
    });
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.update({
      where: { id: adminMember.membershipId },
      data: { deletedAt: new Date() },
    });
    const before = await writeCounts(admin.accountId);

    const response = await postClinic(adminMember.context, organizationId);

    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Resource not found");
    expect(await writeCounts(admin.accountId)).toEqual(before);
  });

  test("un ADMIN de sede con deletedAt no puede invitar: 404 y sin escrituras", async () => {
    const admin = await createOnboardedAdmin({
      emailPrefix: "admin-borrada-b",
    });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-BORRADA-B"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede borrada"),
    });
    const adminMember = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: clinicId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminsede-borrada",
    });
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.update({
      where: { id: adminMember.membershipId },
      data: { deletedAt: new Date() },
    });
    const before = await writeCounts(admin.accountId);
    const invitedEmail = uniqueEmail("borrada");

    const response = await postInvitation(
      adminMember.context,
      clinicId,
      invitedEmail,
    );

    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Resource not found");
    expect(await writeCounts(admin.accountId)).toEqual(before);
    expect(
      await prisma.user.findUnique({ where: { email: invitedEmail } }),
    ).toBeNull();
  });
});

test.describe("Id del tipo equivocado", () => {
  test("un ADMIN de organización recibe 404 en español al usar el id de una sede como organización y el de la organización como sede", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-tipo" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-TIPO"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede tipo"),
    });
    const before = await writeCounts(admin.accountId);

    const clinicAsOrganization = await postClinic(admin.context, clinicId);
    expect(clinicAsOrganization.status()).toBe(404);
    expect(await clinicAsOrganization.json()).toEqual({
      message: "Organización no encontrada",
    });

    const organizationAsClinic = await postInvitation(
      admin.context,
      organizationId,
      uniqueEmail("tipo"),
    );
    expect(organizationAsClinic.status()).toBe(404);
    expect(await organizationAsClinic.json()).toEqual({
      message: "Sede no encontrada",
    });

    expect(await writeCounts(admin.accountId)).toEqual(before);
  });

  test("un UUID inexistente responde 404 de la política", async () => {
    const admin = await createOnboardedAdmin({
      emailPrefix: "admin-inexistente",
    });
    await createOrganizationResource(admin, uniqueName("ORG-INEXISTENTE"));
    const before = await writeCounts(admin.accountId);
    const invitedEmail = uniqueEmail("inexistente");

    const response = await postInvitation(
      admin.context,
      randomUUID(),
      invitedEmail,
    );

    expect(response.status()).toBe(404);
    expect((await response.json()).message).toBe("Resource not found");
    expect(await writeCounts(admin.accountId)).toEqual(before);
    const prisma = await getTestPrisma();
    expect(
      await prisma.user.findUnique({ where: { email: invitedEmail } }),
    ).toBeNull();
  });
});
