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
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { createConfirmedUser, uniqueName } from "../../support/users";

/**
 * docs/features/fix-org-clinic-creation-role/plan.md — CA-1 a CA-8, CA-11 a
 * CA-15, CA-17 y CA-18 ([e2e]). CA-9, CA-10, CA-20 y CA-21 están en
 * ui/account/create-organization-button.spec.ts. CA-16 se cumple no tocando
 * los specs que nombra (invite-doctor, invite-user-form,
 * fix-user-by-email-scope, fix-auth-user-fields-input). CA-19 es [manual].
 */

const NONEXISTENT_ORGANIZATION_ID = "00000000-0000-7000-8000-000000000000";
const FORBIDDEN_ORGANIZATION_MESSAGE =
  "Sólo un administrador puede crear organizaciones";
const FORBIDDEN_CLINIC_MESSAGE =
  "Sólo un administrador de la organización puede crear sedes";
const NOT_FOUND_ORGANIZATION_MESSAGE = "Organización no encontrada";

function postOrganization(context: APIRequestContext, name: string) {
  return context.post(`${API_BASE_URL}/organization`, { data: { name } });
}

function postClinic(
  context: APIRequestContext,
  organizationId: string,
  overrides: { name?: string; phone?: string; address?: string } = {},
) {
  return context.post(`${API_BASE_URL}/clinic`, {
    data: {
      name: overrides.name ?? uniqueName("Sede"),
      phone: overrides.phone ?? "+51999888777",
      address: overrides.address ?? "Av. Siempre Viva 123",
      organizationId,
    },
  });
}

async function structureCounts(accountId: string) {
  const prisma = await getTestPrisma();
  const [resources, organizations, memberships] = await Promise.all([
    prisma.resource.count({ where: { accountId } }),
    prisma.organization.count({ where: { accountId } }),
    prisma.userResourceMembership.count({ where: { accountId } }),
  ]);
  return { resources, organizations, memberships };
}

async function clinicCount(accountId: string) {
  const prisma = await getTestPrisma();
  return prisma.resource.count({ where: { accountId, type: "CLINIC" } });
}

test.describe("Lo que deja de ser posible", () => {
  test("CA-1: un USER y un DOCTOR de una organización reciben 403 al crear una organización y no se escribe nada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca1" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA1"),
    );

    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca1",
    });
    const doctor = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "DOCTOR",
      createdBy: admin.userId,
      emailPrefix: "doctor-ca1",
    });

    const before = await structureCounts(admin.accountId);

    const userResponse = await postOrganization(
      user.context,
      uniqueName("Org de USER"),
    );
    expect(userResponse.status()).toBe(403);
    expect((await userResponse.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );

    const doctorResponse = await postOrganization(
      doctor.context,
      uniqueName("Org de DOCTOR"),
    );
    expect(doctorResponse.status()).toBe(403);
    expect((await doctorResponse.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );

    expect(await structureCounts(admin.accountId)).toEqual(before);
  });

  test("CA-2: un ADMIN sólo de una sede recibe 403 al crear una organización y no se escribe nada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca2" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA2"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-2"),
    });

    const adminOfClinic = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: clinicId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminsede-ca2",
    });

    const before = await structureCounts(admin.accountId);

    const response = await postOrganization(
      adminOfClinic.context,
      uniqueName("Org de admin de sede"),
    );
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );

    expect(await structureCounts(admin.accountId)).toEqual(before);
  });

  test("CA-3: un usuario de una cuenta sin organizaciones que no es su dueño recibe 403 al crear una organización y no se escribe nada", async () => {
    const owner = await createOnboardedAdmin({ emailPrefix: "owner-ca3" });

    const intruderContext = await createApiContext();
    const intruder = await createConfirmedUser(intruderContext, {
      emailPrefix: "intruso-ca3",
    });
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { email: intruder.email },
      data: { accountId: owner.accountId, onboardingCompleted: true },
    });

    const before = await structureCounts(owner.accountId);

    const response = await postOrganization(
      intruderContext,
      uniqueName("Org del intruso"),
    );
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );

    expect(await structureCounts(owner.accountId)).toEqual(before);
  });

  test("CA-4: un ADMIN de una organización de otra cuenta, sin rol ADMIN en la suya, recibe 403 al crear una organización", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca4" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA4"),
    );
    const attacker = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "atacante-ca4",
    });

    const otherAccount = await createOnboardedAdmin({
      emailPrefix: "otracuenta-ca4",
    });
    const otherOrganizationId = await createOrganizationResource(
      otherAccount,
      uniqueName("ORG-CA4-OTRA"),
    );

    // Membership forjada: accountId de la cuenta propia, resourceId de la organización de la otra.
    // El filtro `resource.accountId` del caso de uso debe descartarla igual.
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.create({
      data: {
        userId: attacker.userId,
        resourceId: otherOrganizationId,
        accountId: admin.accountId,
        role: "ADMIN",
        createdBy: admin.userId,
      },
    });

    const response = await postOrganization(
      attacker.context,
      uniqueName("Org del atacante"),
    );
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );
  });

  test("CA-5: un USER, un DOCTOR y un ADMIN sólo de una sede reciben 403 (no 402) al crear una sede y el número de sedes no cambia", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca5" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA5"),
    );

    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca5",
    });
    const doctor = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "DOCTOR",
      createdBy: admin.userId,
      emailPrefix: "doctor-ca5",
    });

    // Sede de control vía Prisma, sólo para que exista un recurso del que ser
    // ADMIN de sede (no de la organización); el 403 por rol se comprueba antes
    // que el cupo, así que da igual que esta sede ya lo haya consumido.
    const controlClinicId = await createClinicResourceViaPrisma(
      admin,
      organizationId,
      {
        name: uniqueName("Sede de control CA-5"),
      },
    );
    const adminOfClinic = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: controlClinicId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminsede-ca5",
    });

    const before = await clinicCount(admin.accountId);

    for (const caller of [user, doctor, adminOfClinic]) {
      const response = await postClinic(caller.context, organizationId);
      expect(response.status()).toBe(403);
      expect((await response.json()).message).toBe(FORBIDDEN_CLINIC_MESSAGE);
    }

    expect(await clinicCount(admin.accountId)).toBe(before);
  });

  test("CA-6: un ADMIN de la organización A recibe 403 al crear una sede bajo la organización B de la misma cuenta y no se crea la sede", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca6" });
    const organizationAId = await createOrganizationResource(
      admin,
      uniqueName("ORG-A-CA6"),
    );
    const organizationBId = await createOrganizationResource(
      admin,
      uniqueName("ORG-B-CA6"),
    );

    const adminOfA = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationAId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminorga-ca6",
    });

    const before = await clinicCount(admin.accountId);

    const response = await postClinic(adminOfA.context, organizationBId);
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toBe(FORBIDDEN_CLINIC_MESSAGE);

    expect(await clinicCount(admin.accountId)).toBe(before);
  });

  test("CA-7: una membership ADMIN de organización con deleted_at recibe 403 al crear una sede sobre esa organización y al crear otra organización", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca7" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA7"),
    );

    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.updateMany({
      where: {
        userId: admin.userId,
        resourceId: organizationId,
        role: "ADMIN",
      },
      data: { deletedAt: new Date() },
    });

    const clinicResponse = await postClinic(admin.context, organizationId);
    expect(clinicResponse.status()).toBe(403);
    expect((await clinicResponse.json()).message).toBe(
      FORBIDDEN_CLINIC_MESSAGE,
    );

    // La cuenta ya tiene una organización: sin la membership viva, el dueño
    // no puede usar el atajo de "primera organización" de CA-11.
    const organizationResponse = await postOrganization(
      admin.context,
      uniqueName("Org CA-7-2"),
    );
    expect(organizationResponse.status()).toBe(403);
    expect((await organizationResponse.json()).message).toBe(
      FORBIDDEN_ORGANIZATION_MESSAGE,
    );
  });

  test("CA-8: organizationId que no es UUID responde 400 y no 500", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca8" });

    const response = await postClinic(admin.context, "no-es-uuid");

    expect(response.status()).toBe(400);
  });
});

test.describe("Lo que sigue funcionando", () => {
  test("CA-11: un dueño que ya es ADMIN de su organización recibe 201 al crear otra y queda ADMIN de la nueva", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca11" });
    await createOrganizationResource(admin, uniqueName("ORG-CA11-1"));

    const secondOrganizationName = uniqueName("ORG-CA11-2");
    const response = await postOrganization(
      admin.context,
      secondOrganizationName,
    );
    expect(response.status()).toBe(201);

    const membershipsResponse = await admin.context.get(
      `${API_BASE_URL}/user/me/memberships`,
    );
    const { memberships } = (await membershipsResponse.json()) as {
      memberships: {
        organization: { name: string };
        membership: { role: string } | null;
      }[];
    };
    const newOrganization = memberships.find(
      (m) => m.organization.name === secondOrganizationName,
    );
    expect(newOrganization?.membership?.role).toBe("ADMIN");
  });

  test("CA-12: un ADMIN de organización que no es el dueño recibe 201 al crear otra y queda ADMIN de la nueva", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca12" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA12"),
    );
    const adminMember = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminorg-ca12",
    });

    const newOrganizationName = uniqueName("ORG-CA12-2");
    const response = await postOrganization(
      adminMember.context,
      newOrganizationName,
    );
    expect(response.status()).toBe(201);

    const membershipsResponse = await adminMember.context.get(
      `${API_BASE_URL}/user/me/memberships`,
    );
    const { memberships } = (await membershipsResponse.json()) as {
      memberships: {
        organization: { name: string };
        membership: { role: string } | null;
      }[];
    };
    const newOrganization = memberships.find(
      (m) => m.organization.name === newOrganizationName,
    );
    expect(newOrganization?.membership?.role).toBe("ADMIN");
  });

  test("CA-13: un ADMIN de organización con cupo libre recibe 201 al crear una sede y queda con el account_id de la organización", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca13" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA13"),
    );
    const clinicName = uniqueName("Sede CA-13");

    const response = await postClinic(admin.context, organizationId, {
      name: clinicName,
    });
    expect(response.status()).toBe(201);

    const prisma = await getTestPrisma();
    const clinic = await prisma.clinic.findFirst({
      where: {
        name: clinicName,
        resource: {
          accountId: admin.accountId,
          parentResourceId: organizationId,
        },
      },
    });
    expect(clinic).toBeTruthy();
  });

  test("CA-14: un ADMIN de organización con el cupo de sedes agotado recibe 402 con la mejora de plan", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca14" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA14"),
    );
    await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede CA-14-1"),
    });

    const response = await postClinic(admin.context, organizationId, {
      name: uniqueName("Sede CA-14-2"),
    });

    expect(response.status()).toBe(402);
    expect((await response.json()).message).toBe(
      "El plan FREE incluye 1 sedes",
    );
  });

  test("CA-15: los 403 de CA-5 y CA-6 no consumen cupo; el ADMIN legítimo crea la sede con el último cupo libre", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca15" });
    const organizationAId = await createOrganizationResource(
      admin,
      uniqueName("ORG-A-CA15"),
    );
    const organizationBId = await createOrganizationResource(
      admin,
      uniqueName("ORG-B-CA15"),
    );

    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationAId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca15",
    });
    const adminOfA = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationAId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "adminorga-ca15",
    });

    const rejectedByRole = await postClinic(user.context, organizationAId);
    expect(rejectedByRole.status()).toBe(403);

    const rejectedByWrongOrganization = await postClinic(
      adminOfA.context,
      organizationBId,
    );
    expect(rejectedByWrongOrganization.status()).toBe(403);

    expect(await clinicCount(admin.accountId)).toBe(0);

    const legitimateResponse = await postClinic(
      admin.context,
      organizationAId,
      {
        name: uniqueName("Sede CA-15"),
      },
    );
    expect(legitimateResponse.status()).toBe(201);
    expect(await clinicCount(admin.accountId)).toBe(1);
  });
});

test.describe("Lo que no debe filtrarse", () => {
  test("CA-17: una organización de otra cuenta, el id de una sede propia o un UUID inexistente responden 404 con el mismo cuerpo, nunca 403 ni 500, y no se escribe nada", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca17" });
    const ownOrganizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA17"),
    );
    const ownClinicId = await createClinicResource(admin, ownOrganizationId, {
      name: uniqueName("Sede CA-17"),
    });
    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: ownOrganizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca17",
    });

    const otherAccount = await createOnboardedAdmin({
      emailPrefix: "otracuenta-ca17",
    });
    const otherOrganizationId = await createOrganizationResource(
      otherAccount,
      uniqueName("ORG-CA17-OTRA"),
    );

    const before = await structureCounts(admin.accountId);

    for (const rejectedOrganizationId of [
      otherOrganizationId,
      ownClinicId,
      NONEXISTENT_ORGANIZATION_ID,
    ]) {
      for (const caller of [admin, user]) {
        const response = await postClinic(
          caller.context,
          rejectedOrganizationId,
        );
        expect(response.status()).toBe(404);
        expect(await response.json()).toEqual({
          message: NOT_FOUND_ORGANIZATION_MESSAGE,
        });
      }
    }

    expect(await structureCounts(admin.accountId)).toEqual(before);
  });

  test("CA-18: los 403 y 404 de POST /organization y POST /clinic sólo traen message", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "admin-ca18" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-CA18"),
    );
    const user = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "user-ca18",
    });

    const organizationForbidden = await postOrganization(
      user.context,
      uniqueName("Org CA-18"),
    );
    expect(organizationForbidden.status()).toBe(403);
    expect(Object.keys(await organizationForbidden.json())).toEqual([
      "message",
    ]);

    const clinicForbidden = await postClinic(user.context, organizationId);
    expect(clinicForbidden.status()).toBe(403);
    expect(Object.keys(await clinicForbidden.json())).toEqual(["message"]);

    const clinicNotFound = await postClinic(
      admin.context,
      NONEXISTENT_ORGANIZATION_ID,
    );
    expect(clinicNotFound.status()).toBe(404);
    expect(Object.keys(await clinicNotFound.json())).toEqual(["message"]);
  });
});
