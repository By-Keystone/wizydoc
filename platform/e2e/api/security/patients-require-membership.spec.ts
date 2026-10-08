import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
  type SeededMember,
  type SeedMembershipRole,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { test, expect } from "../../support/test";
import { uniqueName } from "../../support/users";

const INITIAL_PHONE = "+51900000001";
const PHONE_WHILE_MEMBER = "+51900000002";
const PHONE_AFTER_REMOVAL = "+51900000003";

interface Workspace {
  admin: OnboardedAdmin;
  clinicId: string;
  patientId: string;
}

async function createWorkspace(label: string): Promise<Workspace> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName(`Sede-${label}`),
  });
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: admin.accountId },
    data: { plan: "CONSULTORIO", status: "ACTIVE" },
  });
  const patient = await prisma.patient.create({
    data: {
      name: "Paula",
      lastName: "Paciente",
      email: `paula-${randomUUID()}@example.com`,
      phone: INITIAL_PHONE,
      documentNumber: randomUUID().slice(0, 8),
      documentType: "DNI",
      accountId: admin.accountId,
    },
  });
  return { admin, clinicId, patientId: patient.id };
}

function addMember(
  workspace: Workspace,
  role: SeedMembershipRole,
): Promise<SeededMember> {
  return createMemberWithRole({
    accountId: workspace.admin.accountId,
    resourceId: workspace.clinicId,
    role,
    createdBy: workspace.admin.userId,
    emailPrefix: `${role.toLowerCase()}-membership`,
  });
}

function callRoutes(member: SeededMember, workspace: Workspace) {
  const { context } = member;
  return {
    list: () => context.get(`${API_BASE_URL}/patients`),
    detail: () =>
      context.get(`${API_BASE_URL}/patients/${workspace.patientId}`),
    update: (phone: string) =>
      context.patch(`${API_BASE_URL}/patients/${workspace.patientId}`, {
        data: { phone },
      }),
    clinics: () => context.get(`${API_BASE_URL}/clinic`),
  };
}

async function expectResourceNotFound(response: APIResponse) {
  expect(response.status()).toBe(404);
  expect(await response.json()).toMatchObject({
    message: "Resource not found",
  });
}

async function storedPhone(patientId: string): Promise<string | undefined> {
  const prisma = await getTestPrisma();
  const patient = await prisma.patient.findFirst({ where: { id: patientId } });
  return patient?.phone;
}

const roles: SeedMembershipRole[] = ["ADMIN", "DOCTOR", "USER"];

for (const role of roles) {
  test(`${role}: con membership viva accede y sin ninguna recibe 404`, async () => {
    const workspace = await createWorkspace(`pm-${role.toLowerCase()}`);
    const member = await addMember(workspace, role);
    const routes = callRoutes(member, workspace);

    expect((await routes.list()).status()).toBe(200);
    expect((await routes.detail()).status()).toBe(200);
    expect((await routes.clinics()).status()).toBe(200);
    expect((await routes.update(PHONE_WHILE_MEMBER)).status()).toBe(204);
    expect(await storedPhone(workspace.patientId)).toBe(PHONE_WHILE_MEMBER);

    await softDeleteMembership(member.membershipId);

    await expectResourceNotFound(await routes.list());
    await expectResourceNotFound(await routes.detail());
    await expectResourceNotFound(await routes.update(PHONE_AFTER_REMOVAL));
    await expectResourceNotFound(await routes.clinics());
    expect(await storedPhone(workspace.patientId)).toBe(PHONE_WHILE_MEMBER);
  });
}

test("en plan Gratis, sin membership viva responde 404 y no 402", async () => {
  const admin = await createOnboardedAdmin({
    emailPrefix: "admin-sin-membership",
  });

  const response = await admin.context.get(`${API_BASE_URL}/patients`);

  await expectResourceNotFound(response);
});
