import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResource,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "../../support/accounts";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { readEmailsTo } from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { addDoctorProfile, findDoctorProfileId } from "../../support/profile";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2: todo ADMIN de la organización atiende por defecto en cada sede.

interface Person {
  email: string;
  name: string;
  lastName: string;
  phone: string;
}

function postOrganizationAssignment(
  context: APIRequestContext,
  organizationId: string,
  person: Person,
  role: "ADMIN" | "USER",
) {
  return context.post(
    `${API_BASE_URL}/organization/${organizationId}/invitations`,
    {
      data: {
        email: person.email,
        name: person.name,
        lastName: person.lastName,
        phone: person.phone,
        role,
      },
    },
  );
}

async function setClinicaPlan(admin: OnboardedAdmin) {
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: admin.accountId },
    data: { plan: "CLINICA", status: "ACTIVE" },
  });
}

async function membershipOf(userId: string, resourceId: string) {
  const prisma = await getTestPrisma();
  return prisma.userResourceMembership.findFirst({
    where: { userId, resourceId },
  });
}

async function listedProfileIds(clinicId: string): Promise<string[]> {
  const anonymous = await createApiContext();
  const response = await anonymous.get(
    `${API_BASE_URL}/clinic/${clinicId}/doctors`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { doctorProfileId: string }[]).map(
    (doctor) => doctor.doctorProfileId,
  );
}

async function metricsDoctors(
  context: APIRequestContext,
  organizationId: string,
  clinicId: string,
) {
  const clinic = await context.get(
    `${API_BASE_URL}/clinic/${clinicId}/metrics`,
  );
  const organization = await context.get(
    `${API_BASE_URL}/organization/${organizationId}/metrics/doctor-count`,
  );
  expect(clinic.status()).toBe(200);
  expect(organization.status()).toBe(200);
  return {
    clinic: ((await clinic.json()) as { doctors: number }).doctors,
    organization: ((await organization.json()) as { doctorCount: number })
      .doctorCount,
  };
}

test.describe("Crear una sede", () => {
  test("it2-cl-1, 11 y 12: cada ADMIN vivo de la organización recibe DOCTOR y perfil vacío; nadie más; sin invitaciones ni correos", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "attends-def" });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-DEF"),
    );
    const secondAdmin = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "attends-def-admin2",
    });
    const plainUser = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "USER",
      createdBy: admin.userId,
      emailPrefix: "attends-def-user",
    });
    const removedAdmin = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: organizationId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "attends-def-removed",
    });
    await softDeleteMembership(removedAdmin.membershipId);
    const otherOrganizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-DEF-OTRA"),
    );
    const otherOrgAdmin = await createMemberWithRole({
      accountId: admin.accountId,
      resourceId: otherOrganizationId,
      role: "ADMIN",
      createdBy: admin.userId,
      emailPrefix: "attends-def-otra",
    });
    const emailsBefore = readEmailsTo(secondAdmin.email).length;
    const prisma = await getTestPrisma();
    const invitationsBefore = await prisma.userInvitation.count({
      where: { membership: { accountId: admin.accountId } },
    });

    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede-DEF"),
    });

    for (const attending of [admin, secondAdmin]) {
      expect((await membershipOf(attending.userId, clinicId))?.role).toBe(
        "DOCTOR",
      );
      const profile = await prisma.doctorProfile.findFirst({
        where: {
          membership: { userId: attending.userId, resourceId: clinicId },
        },
        select: { id: true, specialties: { select: { id: true } } },
      });
      expect(profile).not.toBeNull();
      expect(profile?.specialties).toEqual([]);
    }
    for (const outsider of [plainUser, removedAdmin, otherOrgAdmin]) {
      expect(await membershipOf(outsider.userId, clinicId)).toBeNull();
    }
    expect(
      await prisma.userInvitation.count({
        where: { membership: { accountId: admin.accountId } },
      }),
    ).toBe(invitationsBefore);
    expect(readEmailsTo(secondAdmin.email)).toHaveLength(emailsBefore);
  });

  test("el perfil vacío no sale en el booking ni cuenta en «Médicos»; con especialidad y horario sí", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "attends-def-bk" });
    await setClinicaPlan(admin);
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-DEF-BK"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede-DEF-BK"),
    });
    const specialtyId = await createSpecialty(admin, organizationId);

    expect(await listedProfileIds(clinicId)).toEqual([]);
    expect(
      await metricsDoctors(admin.context, organizationId, clinicId),
    ).toEqual({ clinic: 0, organization: 0 });

    await addDoctorProfile(admin.userId, clinicId, [specialtyId]);
    await seedFullDayAvailability(admin.userId, clinicId);

    const profileId = await findDoctorProfileId(admin.userId, clinicId);
    expect(await listedProfileIds(clinicId)).toEqual([profileId]);
    expect(
      await metricsDoctors(admin.context, organizationId, clinicId),
    ).toEqual({ clinic: 1, organization: 1 });
  });

  test("it2-cl-7: el dueño sigue siendo ADMIN de la sede y trae doctorProfileId", async () => {
    const admin = await createOnboardedAdmin({
      emailPrefix: "attends-def-own",
    });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-DEF-OWN"),
    );
    const clinicId = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede-DEF-OWN"),
    });

    const response = await admin.context.get(
      `${API_BASE_URL}/user/me/resource/${clinicId}/membership`,
    );

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      role: string;
      doctorProfileId: string | null;
    };
    expect(body.role).toBe("ADMIN");
    expect(body.doctorProfileId).toBe(
      await findDoctorProfileId(admin.userId, clinicId),
    );
    expect(body.doctorProfileId).not.toBeNull();
  });
});

test.describe("Pasar a ADMIN de la organización", () => {
  async function setup(label: string) {
    const admin = await createOnboardedAdmin({
      emailPrefix: `attends-${label}`,
    });
    const organizationId = await createOrganizationResource(
      admin,
      uniqueName(`ORG-${label}`),
    );
    const clinicA = await createClinicResource(admin, organizationId, {
      name: uniqueName("Sede-A"),
    });
    const clinicB = await createClinicResourceViaPrisma(admin, organizationId, {
      name: uniqueName("Sede-B"),
    });
    const clinicC = await createClinicResourceViaPrisma(admin, organizationId, {
      name: uniqueName("Sede-C"),
    });
    const specialtyId = await createSpecialty(admin, organizationId);
    return { admin, organizationId, clinicA, clinicB, clinicC, specialtyId };
  }

  test("it2-cl-2 e it2-cl-3: crea DOCTOR + perfil, respeta la USER viva y revive la borrada con su mismo perfil, especialidad y horario", async () => {
    const world = await setup("promote");
    const person = await createMemberWithRole({
      accountId: world.admin.accountId,
      resourceId: world.clinicB,
      role: "USER",
      createdBy: world.admin.userId,
      emailPrefix: "attends-promote-person",
    });
    const asDoctor = await createMemberWithRole({
      accountId: world.admin.accountId,
      resourceId: world.clinicC,
      role: "DOCTOR",
      createdBy: world.admin.userId,
      emailPrefix: "attends-promote-doctor",
    });
    await addDoctorProfile(asDoctor.userId, world.clinicC, [world.specialtyId]);
    await seedFullDayAvailability(asDoctor.userId, world.clinicC);
    const profileC = await findDoctorProfileId(asDoctor.userId, world.clinicC);
    await softDeleteMembership(asDoctor.membershipId);

    const first = await postOrganizationAssignment(
      world.admin.context,
      world.organizationId,
      person,
      "ADMIN",
    );
    const second = await postOrganizationAssignment(
      world.admin.context,
      world.organizationId,
      asDoctor,
      "ADMIN",
    );

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await membershipOf(person.userId, world.clinicA))?.role).toBe(
      "DOCTOR",
    );
    expect(
      await findDoctorProfileId(person.userId, world.clinicA),
    ).not.toBeNull();
    expect((await membershipOf(person.userId, world.clinicB))?.role).toBe(
      "USER",
    );
    expect(await findDoctorProfileId(person.userId, world.clinicB)).toBeNull();

    const revived = await membershipOf(asDoctor.userId, world.clinicC);
    expect(revived?.role).toBe("DOCTOR");
    expect(revived?.deletedAt).toBeNull();
    expect(await findDoctorProfileId(asDoctor.userId, world.clinicC)).toBe(
      profileC,
    );
    expect(await listedProfileIds(world.clinicC)).toContain(profileC);
  });

  test("it2-cl-10: volver a guardar al ADMIN no crea ni cambia memberships", async () => {
    const world = await setup("resave");
    const person = await createMemberWithRole({
      accountId: world.admin.accountId,
      resourceId: world.organizationId,
      role: "ADMIN",
      createdBy: world.admin.userId,
      emailPrefix: "attends-resave-admin",
    });
    const prisma = await getTestPrisma();
    const count = () =>
      prisma.userResourceMembership.count({
        where: { accountId: world.admin.accountId },
      });
    const before = await count();

    const response = await postOrganizationAssignment(
      world.admin.context,
      world.organizationId,
      person,
      "ADMIN",
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "updated" });
    expect(await count()).toBe(before);
    expect(await membershipOf(person.userId, world.clinicA)).toBeNull();
  });

  test("it2-cl-8 (2b): degradar a USER sin citas pendientes cierra sus DOCTOR de sede y vuelve a entrar como USER heredado", async () => {
    const world = await setup("demote");
    const person = await createMemberWithRole({
      accountId: world.admin.accountId,
      resourceId: world.organizationId,
      role: "USER",
      createdBy: world.admin.userId,
      emailPrefix: "attends-demote-person",
    });
    const promoted = await postOrganizationAssignment(
      world.admin.context,
      world.organizationId,
      person,
      "ADMIN",
    );
    expect(promoted.status()).toBe(200);

    const demoted = await postOrganizationAssignment(
      world.admin.context,
      world.organizationId,
      person,
      "USER",
    );

    expect(demoted.status()).toBe(200);
    for (const clinicId of [world.clinicA, world.clinicB, world.clinicC]) {
      const membership = await membershipOf(person.userId, clinicId);
      expect(membership?.role).toBe("DOCTOR");
      expect(membership?.deletedAt).not.toBeNull();
    }
    const response = await person.context.get(
      `${API_BASE_URL}/user/me/resource/${world.clinicA}/membership`,
    );
    expect(((await response.json()) as { role: string }).role).toBe("USER");
  });
});
