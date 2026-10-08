import { randomUUID } from "node:crypto";
import type { APIResponse } from "@playwright/test";
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
  type SeedMembershipRole,
} from "../../support/accounts";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import {
  invitePendingUser,
  softDeleteMembership,
} from "../../support/invitations";
import { uniqueName } from "../../support/users";

/**
 * docs/features/membership-deleted-filter/plan.md — CA-1 a CA-9. CA-10 es la
 * suite existente; CA-11 a CA-16 se verifican por revisión.
 */

interface Workspace {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
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
  return { admin, organizationId, clinicId };
}

async function addMembership(
  workspace: Workspace,
  userId: string,
  resourceId: string,
  role: SeedMembershipRole,
): Promise<string> {
  const prisma = await getTestPrisma();
  const membership = await prisma.userResourceMembership.create({
    data: {
      userId,
      resourceId,
      accountId: workspace.admin.accountId,
      role,
      createdBy: workspace.admin.userId,
    },
  });
  return membership.id;
}

function addMember(
  workspace: Workspace,
  resourceId: string,
  role: SeedMembershipRole,
  label: string,
) {
  return createMemberWithRole({
    accountId: workspace.admin.accountId,
    resourceId,
    role,
    createdBy: workspace.admin.userId,
    emailPrefix: label,
  });
}

async function expectResourceNotFound(response: APIResponse) {
  expect(response.status()).toBe(404);
  expect(await response.json()).toMatchObject({
    message: "Resource not found",
  });
}

interface MembershipGroup {
  organization: { resourceId: string };
  membership: { membershipId: string } | null;
  clinics: { resourceId: string; accessVia: string }[];
}

async function getMembershipGroups(
  context: OnboardedAdmin["context"],
): Promise<MembershipGroup[]> {
  const response = await context.get(`${API_BASE_URL}/user/me/memberships`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { memberships: MembershipGroup[] };
  return body.memberships;
}

function getAppointmentsToday(
  context: OnboardedAdmin["context"],
  clinicId: string,
) {
  return context.get(`${API_BASE_URL}/clinic/${clinicId}/appointments/today`);
}

function getClinicUsers(context: OnboardedAdmin["context"], clinicId: string) {
  return context.get(`${API_BASE_URL}/clinic/${clinicId}/users`);
}

function getMembership(context: OnboardedAdmin["context"], resourceId: string) {
  return context.get(
    `${API_BASE_URL}/user/me/resource/${resourceId}/membership`,
  );
}

test.describe("Acceso del personal", () => {
  test("CA-1: USER sin herencia pierde el acceso a la sede", async () => {
    const workspace = await createWorkspace("ca1");
    const member = await addMember(
      workspace,
      workspace.clinicId,
      "USER",
      "user-ca1",
    );

    expect(
      (await getAppointmentsToday(member.context, workspace.clinicId)).status(),
    ).toBe(200);

    await softDeleteMembership(member.membershipId);

    await expectResourceNotFound(
      await getAppointmentsToday(member.context, workspace.clinicId),
    );
  });

  test("CA-2: ADMIN quitado de la sede pierde la administración", async () => {
    const workspace = await createWorkspace("ca2");
    const admin = await addMember(
      workspace,
      workspace.clinicId,
      "ADMIN",
      "admin-sede-ca2",
    );

    expect(
      (await getClinicUsers(admin.context, workspace.clinicId)).status(),
    ).toBe(200);

    await softDeleteMembership(admin.membershipId);

    await expectResourceNotFound(
      await getClinicUsers(admin.context, workspace.clinicId),
    );
  });

  test("CA-3: la membership borrada ya no se devuelve en /me/resource", async () => {
    const workspace = await createWorkspace("ca3");
    const member = await addMember(
      workspace,
      workspace.clinicId,
      "USER",
      "user-ca3",
    );

    const alive = await getMembership(member.context, workspace.clinicId);
    expect(alive.status()).toBe(200);
    expect(await alive.json()).toMatchObject({
      membershipId: member.membershipId,
      resourceId: workspace.clinicId,
    });

    await softDeleteMembership(member.membershipId);

    const deleted = await getMembership(member.context, workspace.clinicId);
    expect(deleted.status()).toBe(200);
    expect(await deleted.text()).toBe("");
  });

  test("CA-4: quitado de la sede conserva lo que le da la organización", async () => {
    const workspace = await createWorkspace("ca4");
    const member = await addMember(
      workspace,
      workspace.organizationId,
      "USER",
      "user-ca4",
    );
    const clinicMembershipId = await addMembership(
      workspace,
      member.userId,
      workspace.clinicId,
      "DOCTOR",
    );

    const alive = await getMembership(member.context, workspace.clinicId);
    expect(await alive.json()).toMatchObject({
      role: "DOCTOR",
      accessVia: "DIRECT",
      membershipId: clinicMembershipId,
    });

    await softDeleteMembership(clinicMembershipId);

    const inherited = await getMembership(member.context, workspace.clinicId);
    expect(await inherited.json()).toMatchObject({
      role: "USER",
      accessVia: "INHERITED_FROM_ORG",
      membershipId: null,
    });
    expect(
      (await getAppointmentsToday(member.context, workspace.clinicId)).status(),
    ).toBe(200);

    const availability = await member.context.put(
      `${API_BASE_URL}/clinic/${workspace.clinicId}/availability`,
      { data: { availabilities: [] } },
    );
    expect(availability.status()).toBe(403);
  });

  test("CA-5: quitado de la organización conserva la sede directa", async () => {
    const workspace = await createWorkspace("ca5");
    const member = await addMember(
      workspace,
      workspace.organizationId,
      "ADMIN",
      "admin-ca5",
    );
    await addMembership(workspace, member.userId, workspace.clinicId, "DOCTOR");

    expect(
      (
        await member.context.get(
          `${API_BASE_URL}/organization/${workspace.organizationId}/clinics`,
        )
      ).status(),
    ).toBe(200);

    await softDeleteMembership(member.membershipId);

    await expectResourceNotFound(
      await member.context.get(
        `${API_BASE_URL}/organization/${workspace.organizationId}/clinics`,
      ),
    );

    const groups = await getMembershipGroups(member.context);
    const group = groups.find(
      (g) => g.organization.resourceId === workspace.organizationId,
    );
    expect(group?.membership).toBeNull();
    expect(group?.clinics).toEqual([
      expect.objectContaining({
        resourceId: workspace.clinicId,
        accessVia: "DIRECT",
      }),
    ]);
  });

  test("CA-6: /me/memberships sólo muestra lo vivo", async () => {
    const workspace = await createWorkspace("ca6");
    const secondClinicId = await createClinicResourceViaPrisma(
      workspace.admin,
      workspace.organizationId,
    );
    const member = await addMember(
      workspace,
      workspace.clinicId,
      "DOCTOR",
      "doctor-ca6",
    );
    const secondMembershipId = await addMembership(
      workspace,
      member.userId,
      secondClinicId,
      "DOCTOR",
    );

    const both = await getMembershipGroups(member.context);
    expect(both).toHaveLength(1);
    expect(both[0].clinics.map((c) => c.resourceId).sort()).toEqual(
      [workspace.clinicId, secondClinicId].sort(),
    );

    await softDeleteMembership(member.membershipId);

    const onlySecond = await getMembershipGroups(member.context);
    expect(onlySecond).toHaveLength(1);
    expect(onlySecond[0].clinics.map((c) => c.resourceId)).toEqual([
      secondClinicId,
    ]);

    await softDeleteMembership(secondMembershipId);

    expect(await getMembershipGroups(member.context)).toEqual([]);
  });
});

test.describe("Listados", () => {
  test("CA-7: la lista de usuarios de la sede no muestra a los quitados", async () => {
    const workspace = await createWorkspace("ca7");
    const removed = await addMember(
      workspace,
      workspace.clinicId,
      "USER",
      "removido-ca7",
    );
    const kept = await addMember(
      workspace,
      workspace.clinicId,
      "USER",
      "vivo-ca7",
    );

    async function listedEmails(): Promise<string[]> {
      const response = await getClinicUsers(
        workspace.admin.context,
        workspace.clinicId,
      );
      expect(response.status()).toBe(200);
      const users = (await response.json()) as { email: string }[];
      return users.map((user) => user.email);
    }

    expect(await listedEmails()).toEqual(
      expect.arrayContaining([removed.email, kept.email]),
    );

    await softDeleteMembership(removed.membershipId);

    const afterDelete = await listedEmails();
    expect(afterDelete).toContain(kept.email);
    expect(afterDelete).not.toContain(removed.email);
  });
});

test.describe("Booking público", () => {
  async function inviteDoctor(
    workspace: Workspace,
    specialtyId: string,
    label: string,
  ) {
    const invitation = await invitePendingUser(workspace.admin, {
      resourceId: workspace.clinicId,
      role: "DOCTOR",
      emailPrefix: `doctor-${label}`,
      specialtyIds: [specialtyId],
    });
    const prisma = await getTestPrisma();
    const profile = await prisma.doctorProfile.findFirst({
      where: { userId: invitation.userId },
    });
    if (!profile) throw new Error("La invitación no creó el perfil de médico");
    return {
      userId: invitation.userId,
      membershipId: invitation.membershipId,
      doctorProfileId: profile.id,
    };
  }

  test("CA-8: un médico quitado no se ofrece al paciente", async () => {
    const workspace = await createWorkspace("ca8");
    const specialtyId = await createSpecialty(
      workspace.admin,
      workspace.organizationId,
    );
    const removed = await inviteDoctor(workspace, specialtyId, "removido-ca8");
    const keptMember = await addMember(
      workspace,
      workspace.clinicId,
      "DOCTOR",
      "doctor-vivo-ca8",
    );
    const prisma = await getTestPrisma();
    const kept = await prisma.doctorProfile.create({
      data: {
        userId: keptMember.userId,
        clinicId: workspace.clinicId,
        specialties: { connect: [{ id: specialtyId }] },
      },
    });
    const anonymous = await createApiContext();

    async function listedDoctorProfileIds(): Promise<string[]> {
      const response = await anonymous.get(
        `${API_BASE_URL}/clinic/${workspace.clinicId}/doctors`,
      );
      expect(response.status()).toBe(200);
      const doctors = (await response.json()) as { doctorProfileId: string }[];
      return doctors.map((doctor) => doctor.doctorProfileId);
    }

    expect((await listedDoctorProfileIds()).sort()).toEqual(
      [removed.doctorProfileId, kept.id].sort(),
    );

    await softDeleteMembership(removed.membershipId);

    expect(await listedDoctorProfileIds()).toEqual([kept.id]);
  });

  test("CA-9: un médico quitado no muestra horarios", async () => {
    const workspace = await createWorkspace("ca9");
    const specialtyId = await createSpecialty(
      workspace.admin,
      workspace.organizationId,
    );
    const doctor = await inviteDoctor(workspace, specialtyId, "ca9");
    await seedFullDayAvailability(doctor.userId, workspace.clinicId);
    const anonymous = await createApiContext();

    const from = new Date();
    from.setDate(from.getDate() + 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    const range = `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;

    async function getSlots(doctorProfileId: string) {
      const response = await anonymous.get(
        `${API_BASE_URL}/doctor-profile/${doctorProfileId}/slots?${range}`,
      );
      expect(response.status()).toBe(200);
      return (await response.json()) as { days: Record<string, string[]> };
    }

    const alive = await getSlots(doctor.doctorProfileId);
    expect(Object.values(alive.days).every((slots) => slots.length > 0)).toBe(
      true,
    );

    await softDeleteMembership(doctor.membershipId);

    const deleted = await getSlots(doctor.doctorProfileId);
    expect(Object.keys(deleted.days)).toHaveLength(7);
    expect(
      Object.values(deleted.days).every((slots) => slots.length === 0),
    ).toBe(true);
    expect(deleted).toEqual(await getSlots(randomUUID()));
  });
});
