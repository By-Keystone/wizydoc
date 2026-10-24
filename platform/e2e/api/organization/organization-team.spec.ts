import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
} from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  backdateInvitationExpiry,
  invitePendingUser,
  softDeleteMembership,
} from "../../support/invitations";
import { expect, test } from "../../support/test";
import { authPost, E2E_PASSWORD, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2: la lista de la organización trae una fila por persona con sus accesos.

interface Access {
  clinicId: string | null;
  clinicName: string | null;
  role: string;
}

interface Row {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  invitationStatus: "pending" | null;
  accesses: Access[];
}

function getUsers(context: APIRequestContext, resourceId: string) {
  return context.get(`${API_BASE_URL}/organization/${resourceId}/users`);
}

async function listRows(context: APIRequestContext, resourceId: string) {
  const response = await getUsers(context, resourceId);
  expect(response.status()).toBe(200);
  return (await response.json()) as Row[];
}

async function setupTeam() {
  const admin = await createOnboardedAdmin({ emailPrefix: "team-admin" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-TEAM"),
  );
  const clinicAName = uniqueName("Sede-A");
  const clinicA = await createClinicResource(admin, organizationId, {
    name: clinicAName,
  });
  const clinicBName = uniqueName("Sede-B");
  const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
    name: clinicBName,
  });

  const clinicDoctor = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicA,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: "team-doctor",
  });
  const mixed = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: organizationId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: "team-mixed",
  });
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.create({
    data: {
      userId: mixed.userId,
      resourceId: clinicB,
      accountId: admin.accountId,
      role: "DOCTOR",
      createdBy: admin.userId,
    },
  });

  return {
    admin,
    organizationId,
    clinicA,
    clinicAName,
    clinicB,
    clinicBName,
    clinicDoctor,
    mixed,
  };
}

test.describe("Equipo de la organización", () => {
  test("una fila por persona, con los accesos de la organización primero y las sedes por nombre", async () => {
    const team = await setupTeam();

    const rows = await listRows(team.admin.context, team.organizationId);

    const byEmail = (email: string) => rows.find((row) => row.email === email);
    expect(rows.map((row) => row.email).sort()).toEqual(
      [team.admin.email, team.clinicDoctor.email, team.mixed.email].sort(),
    );
    expect(
      byEmail(team.admin.email)?.accesses.map((a) => [a.clinicId, a.role]),
    ).toEqual([
      [null, "ADMIN"],
      [team.clinicA, "DOCTOR"],
    ]);
    expect(
      byEmail(team.clinicDoctor.email)?.accesses.map((a) => [
        a.clinicName,
        a.role,
      ]),
    ).toEqual([[team.clinicAName, "DOCTOR"]]);
    expect(
      byEmail(team.mixed.email)?.accesses.map((a) => [
        a.clinicId,
        a.clinicName,
        a.role,
      ]),
    ).toEqual([
      [null, null, "USER"],
      [team.clinicB, team.clinicBName, "DOCTOR"],
    ]);
  });

  test("no salen las memberships borradas, las personas de otra organización ni las sedes ajenas", async () => {
    const team = await setupTeam();
    const removed = await createMemberWithRole({
      accountId: team.admin.accountId,
      resourceId: team.clinicA,
      role: "USER",
      createdBy: team.admin.userId,
      emailPrefix: "team-removed",
    });
    await softDeleteMembership(removed.membershipId);
    const otherOrganizationId = await createOrganizationResource(
      team.admin,
      uniqueName("ORG-TEAM-OTRA"),
    );
    const otherClinicId = await createClinicResourceViaPrisma(
      team.admin,
      otherOrganizationId,
    );
    const elsewhere = await createMemberWithRole({
      accountId: team.admin.accountId,
      resourceId: otherClinicId,
      role: "USER",
      createdBy: team.admin.userId,
      emailPrefix: "team-elsewhere",
    });
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.create({
      data: {
        userId: team.clinicDoctor.userId,
        resourceId: otherClinicId,
        accountId: team.admin.accountId,
        role: "USER",
        createdBy: team.admin.userId,
      },
    });

    const rows = await listRows(team.admin.context, team.organizationId);

    const emails = rows.map((row) => row.email);
    expect(emails).not.toContain(removed.email);
    expect(emails).not.toContain(elsewhere.email);
    const doctor = rows.find((row) => row.email === team.clinicDoctor.email);
    expect(doctor?.accesses.map((a) => a.clinicId)).toEqual([team.clinicA]);
  });

  test("invitationStatus: pending sin contraseña (también con el token vencido) y null con contraseña", async () => {
    const team = await setupTeam();
    const pending = await invitePendingUser(team.admin, {
      resourceId: team.clinicA,
      role: "USER",
      emailPrefix: "team-pending",
    });
    const expired = await invitePendingUser(team.admin, {
      resourceId: team.clinicA,
      role: "USER",
      emailPrefix: "team-expired",
    });
    await backdateInvitationExpiry(expired.token);
    const withPassword = await invitePendingUser(team.admin, {
      resourceId: team.clinicA,
      role: "USER",
      emailPrefix: "team-password",
    });
    const response = await authPost(
      await createApiContext(),
      "/invitations/set-password",
      { token: withPassword.token, password: E2E_PASSWORD },
    );
    expect(response.status()).toBe(200);

    const rows = await listRows(team.admin.context, team.organizationId);

    const statusOf = (email: string) =>
      rows.find((row) => row.email === email)?.invitationStatus;
    expect(statusOf(pending.email)).toBe("pending");
    expect(statusOf(expired.email)).toBe("pending");
    expect(statusOf(withPassword.email)).toBeNull();
    expect(statusOf(team.admin.email)).toBeNull();
  });

  test("la forma de la respuesta no trae ids de usuario ni de cuenta", async () => {
    const team = await setupTeam();

    const rows = await listRows(team.admin.context, team.organizationId);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "accesses",
        "email",
        "invitationStatus",
        "lastName",
        "name",
        "phone",
      ]);
      for (const access of row.accesses) {
        expect(Object.keys(access).sort()).toEqual([
          "clinicId",
          "clinicName",
          "role",
        ]);
      }
    }
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain(team.admin.userId);
    expect(raw).not.toContain(team.admin.accountId);
    expect(raw).not.toContain("userId");
    expect(raw).not.toContain("accountId");
  });

  test("el id de una sede, el de una organización de otra cuenta y los roles sin acceso se rechazan", async () => {
    const team = await setupTeam();
    const stranger: OnboardedAdmin = await createOnboardedAdmin({
      emailPrefix: "team-stranger",
    });

    const byClinic = await getUsers(team.admin.context, team.clinicA);
    expect(byClinic.status()).toBe(404);
    expect((await byClinic.json()).message).toBe("Organización no encontrada");

    expect(
      (await getUsers(stranger.context, team.organizationId)).status(),
    ).toBe(404);

    expect(
      (await getUsers(team.mixed.context, team.organizationId)).status(),
    ).toBe(403);
    expect(
      (await getUsers(team.clinicDoctor.context, team.organizationId)).status(),
    ).toBe(404);
    expect(
      (await getUsers(await createApiContext(), team.organizationId)).status(),
    ).toBe(401);
  });
});
