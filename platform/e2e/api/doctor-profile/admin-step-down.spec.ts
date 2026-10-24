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
import { seedPatient } from "../../support/doctor-treatment";
import { API_BASE_URL } from "../../support/env";
import { addDoctorProfile, findDoctorProfileId } from "../../support/profile";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md, iteración 2b: degradar a un ADMIN cierra sus sedes sin citas pendientes.

interface Person {
  email: string;
  name: string;
  lastName: string;
  phone: string;
}

function assignInOrganization(
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

async function setup(label: string) {
  const admin = await createOnboardedAdmin({
    emailPrefix: `stepdown-${label}`,
  });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const names = ["A", "B", "C", "D"].map((letter) =>
    uniqueName(`${letter}-Sede`),
  );
  const clinicA = await createClinicResource(admin, organizationId, {
    name: names[0],
  });
  const others = [];
  for (const name of names.slice(1)) {
    others.push(
      await createClinicResourceViaPrisma(admin, organizationId, { name }),
    );
  }
  const [clinicB, clinicC, clinicD] = others;
  const specialtyId = await createSpecialty(admin, organizationId);
  const person = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: organizationId,
    role: "USER",
    createdBy: admin.userId,
    emailPrefix: `stepdown-person-${label}`,
  });
  const promoted = await assignInOrganization(
    admin.context,
    organizationId,
    person,
    "ADMIN",
  );
  expect(promoted.status()).toBe(200);

  const clinics = { A: clinicA, B: clinicB, C: clinicC, D: clinicD };
  for (const clinicId of [clinicA, clinicB, clinicC]) {
    await addDoctorProfile(person.userId, clinicId, [specialtyId]);
    await seedFullDayAvailability(person.userId, clinicId);
  }
  // Una membership USER directa de sede: no se toca al degradar.
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId: person.userId, resourceId: clinicD },
    data: { role: "USER" },
  });
  // Una cita por atender en C.
  const profileC = (await findDoctorProfileId(
    person.userId,
    clinicC,
  )) as string;
  await prisma.appointment.create({
    data: {
      doctorProfileId: profileC,
      clinicId: clinicC,
      patientId: await seedPatient(admin.accountId),
      scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });

  return { admin, organizationId, names, clinics, specialtyId, person };
}

test.describe("Degradar a un ADMIN", () => {
  test("cierra las sedes sin citas pendientes, deja la que tiene citas y no toca la USER directa; perfil y horarios intactos", async () => {
    const world = await setup("degrade");
    const { admin, person, clinics } = world;
    const profileA = await findDoctorProfileId(person.userId, clinics.A);
    const profileB = await findDoctorProfileId(person.userId, clinics.B);
    const prisma = await getTestPrisma();
    expect(await listedProfileIds(clinics.A)).toContain(profileA);

    const response = await assignInOrganization(
      admin.context,
      world.organizationId,
      person,
      "USER",
    );

    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      message: string;
      stoppedAttending: { clinicId: string; clinicName: string }[];
      stillAttending: {
        clinicId: string;
        clinicName: string;
        pendingAppointments: number;
      }[];
    };
    expect(body.stoppedAttending.map((c) => c.clinicId)).toEqual([
      clinics.A,
      clinics.B,
    ]);
    expect(body.stillAttending).toEqual([
      {
        clinicId: clinics.C,
        clinicName: world.names[2],
        pendingAppointments: 1,
      },
    ]);
    expect(body.message).toContain("Dejó de atender en");
    expect(body.message).toContain("1 cita pendiente");

    for (const clinicId of [clinics.A, clinics.B]) {
      expect(
        (await membershipOf(person.userId, clinicId))?.deletedAt,
      ).not.toBeNull();
    }
    const kept = await membershipOf(person.userId, clinics.C);
    expect(kept?.role).toBe("DOCTOR");
    expect(kept?.deletedAt).toBeNull();
    const userOnly = await membershipOf(person.userId, clinics.D);
    expect(userOnly?.role).toBe("USER");
    expect(userOnly?.deletedAt).toBeNull();

    expect(await findDoctorProfileId(person.userId, clinics.A)).toBe(profileA);
    expect(await findDoctorProfileId(person.userId, clinics.B)).toBe(profileB);
    for (const profileId of [profileA, profileB]) {
      const profile = await prisma.doctorProfile.findFirstOrThrow({
        where: { id: profileId as string },
        select: {
          specialties: { select: { id: true } },
          _count: { select: { availabilities: true } },
        },
      });
      expect(profile.specialties).toHaveLength(1);
      expect(
        (profile as unknown as { _count: { availabilities: number } })._count
          .availabilities,
      ).toBeGreaterThan(0);
    }
    expect(await listedProfileIds(clinics.A)).not.toContain(profileA);
    expect(await listedProfileIds(clinics.B)).not.toContain(profileB);
    expect(await listedProfileIds(clinics.C)).toContain(
      await findDoctorProfileId(person.userId, clinics.C),
    );
  });

  test("volver a ADMIN revive las mismas memberships y el médico vuelve al booking con sus horarios", async () => {
    const world = await setup("regrade");
    const { admin, person, clinics } = world;
    const profileA = await findDoctorProfileId(person.userId, clinics.A);
    await assignInOrganization(
      admin.context,
      world.organizationId,
      person,
      "USER",
    );
    expect(await listedProfileIds(clinics.A)).not.toContain(profileA);

    const response = await assignInOrganization(
      admin.context,
      world.organizationId,
      person,
      "ADMIN",
    );

    expect(response.status()).toBe(200);
    for (const clinicId of [clinics.A, clinics.B]) {
      const membership = await membershipOf(person.userId, clinicId);
      expect(membership?.role).toBe("DOCTOR");
      expect(membership?.deletedAt).toBeNull();
    }
    expect(await findDoctorProfileId(person.userId, clinics.A)).toBe(profileA);
    expect(await listedProfileIds(clinics.A)).toContain(profileA);
    // La USER directa sigue como estaba: grantAttending no toca una membership viva.
    expect((await membershipOf(person.userId, clinics.D))?.role).toBe("USER");
  });

  test("la búsqueda por correo trae el número de citas pendientes por sede, y sólo el número", async () => {
    const world = await setup("lookup");
    const { admin, person, clinics } = world;

    const response = await admin.context.post(
      `${API_BASE_URL}/organization/${world.organizationId}/users/lookup`,
      { data: { email: person.email } },
    );

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as {
      user: {
        clinics: {
          clinicId: string;
          role: string;
          pendingAppointments: number;
        }[];
      };
    };
    const pending = Object.fromEntries(
      user.clinics.map((c) => [c.clinicId, c.pendingAppointments]),
    );
    expect(pending[clinics.A]).toBe(0);
    expect(pending[clinics.C]).toBe(1);
    expect(Object.keys(user.clinics[0]).sort()).toEqual([
      "clinicId",
      "pendingAppointments",
      "role",
      "specialties",
    ]);
  });

  test("otra organización de la cuenta y otra cuenta no se ven afectadas", async () => {
    const world = await setup("scope");
    const { admin, person } = world;
    const otherOrganizationId = await createOrganizationResource(
      admin,
      uniqueName("ORG-step-otra"),
    );
    const otherClinicId = await createClinicResourceViaPrisma(
      admin,
      otherOrganizationId,
    );
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.create({
      data: {
        userId: person.userId,
        resourceId: otherClinicId,
        accountId: admin.accountId,
        role: "DOCTOR",
        createdBy: admin.userId,
      },
    });
    const stranger: OnboardedAdmin = await createOnboardedAdmin({
      emailPrefix: "stepdown-stranger",
    });
    const strangerOrganizationId = await createOrganizationResource(
      stranger,
      uniqueName("ORG-step-ajena"),
    );
    const strangerClinicId = await createClinicResource(
      stranger,
      strangerOrganizationId,
      { name: uniqueName("Sede-ajena") },
    );

    await assignInOrganization(
      admin.context,
      world.organizationId,
      person,
      "USER",
    );

    const otherOrganization = await membershipOf(person.userId, otherClinicId);
    expect(otherOrganization?.role).toBe("DOCTOR");
    expect(otherOrganization?.deletedAt).toBeNull();
    const strangerOwn = await membershipOf(stranger.userId, strangerClinicId);
    expect(strangerOwn?.role).toBe("DOCTOR");
    expect(strangerOwn?.deletedAt).toBeNull();
  });
});
