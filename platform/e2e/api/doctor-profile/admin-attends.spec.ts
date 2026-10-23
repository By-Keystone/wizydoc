import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
  type SeedMembershipRole,
} from "../../support/accounts";
import {
  createPortalScenario,
  type PortalScenario,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { readUserEmail } from "../../support/doctor-treatment";
import { readEmailsTo } from "../../support/email";
import { API_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { signIn, uniqueName } from "../../support/users";

// docs/features/doctor-profile-membership/plan.md: el ADMIN se asigna como Médico y edita sus especialidades por la ruta del médico.

const PROFILE_URL = `${API_BASE_URL}/user/me/profile`;
const FORBIDDEN = {
  message: "Solo un administrador puede cambiar especialidades.",
  code: "FORBIDDEN",
};

interface NamedSpecialty {
  id: string;
  name: string;
}

interface EditableClinic {
  clinicId: string;
  clinicName: string;
  organizationId: string;
  organizationName: string;
  specialties: NamedSpecialty[];
  doctorProfileId: string;
  hasSchedule: boolean;
}

interface Profile {
  clinics: { clinicId: string; specialties: NamedSpecialty[] }[];
  editableClinics: EditableClinic[];
  organizations: { organizationId: string; canCreateSpecialties: boolean }[];
}

interface World extends PortalScenario {
  specialties: NamedSpecialty[];
}

function byName(a: NamedSpecialty, b: NamedSpecialty) {
  return a.name.localeCompare(b.name, "es");
}

async function namedSpecialty(
  scenario: PortalScenario,
  organizationId: string,
  prefix: string,
): Promise<NamedSpecialty> {
  const name = uniqueName(prefix);
  const id = await createSpecialty(scenario.admin, organizationId, name);
  return { id, name };
}

// Alfa y Zeta rodean al nombre de la especialidad del escenario para fijar el orden.
async function createWorld(label: string): Promise<World> {
  const scenario = await createPortalScenario(label);
  const alfa = await namedSpecialty(scenario, scenario.organizationId, "Alfa");
  const zeta = await namedSpecialty(scenario, scenario.organizationId, "Zeta");
  const main = { id: scenario.specialtyId, name: scenario.specialtyName };
  return { ...scenario, specialties: [alfa, main, zeta].sort(byName) };
}

async function signInAs(userId: string) {
  const context = await createApiContext();
  await signIn(context, await readUserEmail(userId));
  return context;
}

function createMemberOf(
  world: World,
  resourceId: string,
  role: SeedMembershipRole,
) {
  return createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId,
    role,
    createdBy: world.admin.userId,
    emailPrefix: `attends-${role.toLowerCase()}`,
  });
}

function assign(
  context: APIRequestContext,
  clinicId: string,
  person: { email: string; name: string; lastName: string; phone: string },
  body: Record<string, unknown>,
) {
  return context.post(`${API_BASE_URL}/clinic/${clinicId}/invitations`, {
    data: {
      email: person.email,
      name: person.name,
      lastName: person.lastName,
      phone: person.phone,
      ...body,
    },
  });
}

function assignSelf(
  world: World,
  admin: OnboardedAdmin,
  specialtyIds: string[],
) {
  return assign(admin.context, world.clinicId, admin, {
    role: "DOCTOR",
    specialtyIds,
  });
}

function putDoctorSpecialties(
  context: APIRequestContext,
  world: World,
  doctorProfileId: string,
  specialtyIds: unknown,
) {
  return context.put(
    `${API_BASE_URL}/organization/${world.organizationId}/clinics/${world.clinicId}/doctors/${doctorProfileId}/specialties`,
    { data: { specialtyIds } },
  );
}

async function profileOf(userId: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findFirst({
    where: { membership: { userId, resourceId: clinicId } },
    select: {
      id: true,
      membershipId: true,
      specialties: { select: { id: true } },
    },
  });
  if (!profile) return null;
  return {
    id: profile.id,
    membershipId: profile.membershipId,
    specialtyIds: (profile.specialties ?? [])
      .map((s: { id: string }) => s.id)
      .sort(),
  };
}

async function getProfile(context: APIRequestContext) {
  const response = await context.get(PROFILE_URL);
  expect(response.status()).toBe(200);
  return (await response.json()) as Profile;
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

test.describe("El ADMIN se asigna como Médico", () => {
  test("asignarse crea la membership DOCTOR y el perfil, sin invitación ni correo", async () => {
    const world = await createWorld("attends-self");
    const [alfa, , zeta] = world.specialties;
    const emailsBefore = readEmailsTo(world.admin.email).length;

    const response = await assignSelf(world, world.admin, [zeta.id, alfa.id]);

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "created",
      invitationSent: false,
    });
    const profile = await profileOf(world.admin.userId, world.clinicId);
    expect(profile?.specialtyIds).toEqual([alfa.id, zeta.id].sort());
    const prisma = await getTestPrisma();
    const membership = await prisma.userResourceMembership.findFirst({
      where: { userId: world.admin.userId, resourceId: world.clinicId },
    });
    expect(membership?.role).toBe("DOCTOR");
    expect(readEmailsTo(world.admin.email)).toHaveLength(emailsBefore);
    expect(
      await prisma.userInvitation.count({
        where: { membershipId: membership?.id },
      }),
    ).toBe(0);
  });

  test("con horarios y especialidad aparece en el booking; sin asignarse no hay perfil", async () => {
    const world = await createWorld("attends-booking");
    expect(await profileOf(world.admin.userId, world.clinicId)).toBeNull();

    await assignSelf(world, world.admin, [world.specialtyId]);
    await seedFullDayAvailability(world.admin.userId, world.clinicId);

    const profile = await profileOf(world.admin.userId, world.clinicId);
    expect(await listedProfileIds(world.clinicId)).toContain(profile?.id);
  });

  test("el membership trae doctorProfileId para quien atiende y null para un USER", async () => {
    const world = await createWorld("attends-membership");
    await assignSelf(world, world.admin, [world.specialtyId]);
    const profile = await profileOf(world.admin.userId, world.clinicId);
    const user = await createMemberOf(world, world.clinicId, "USER");

    const own = await world.admin.context.get(
      `${API_BASE_URL}/user/me/resource/${world.clinicId}/membership`,
    );
    const other = await user.context.get(
      `${API_BASE_URL}/user/me/resource/${world.clinicId}/membership`,
    );

    expect(
      ((await own.json()) as { doctorProfileId: string }).doctorProfileId,
    ).toBe(profile?.id);
    expect(
      ((await other.json()) as { doctorProfileId: string | null })
        .doctorProfileId,
    ).toBeNull();
  });

  test("editar las especialidades propias por la ruta del médico responde 200", async () => {
    const world = await createWorld("attends-edit");
    const [alfa, , zeta] = world.specialties;
    await assignSelf(world, world.admin, [alfa.id]);
    const profile = await profileOf(world.admin.userId, world.clinicId);

    const response = await putDoctorSpecialties(
      world.admin.context,
      world,
      profile!.id,
      [zeta.id],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [zeta] });
  });

  test("un DOCTOR no puede asignarse ni asignar a otro como Médico: 403 sin cambios", async () => {
    const world = await createWorld("attends-doctor-denied");
    const doctor = await createMemberOf(world, world.clinicId, "DOCTOR");
    const target = await createMemberOf(world, world.clinicId, "USER");

    for (const person of [doctor, target]) {
      const response = await assign(doctor.context, world.clinicId, person, {
        role: "DOCTOR",
        specialtyIds: [world.specialtyId],
      });

      expect(response.status()).toBe(403);
    }
    expect(await profileOf(doctor.userId, world.clinicId)).toBeNull();
    expect(await profileOf(target.userId, world.clinicId)).toBeNull();
  });

  test("IDOR: otra cuenta, una sede de otra organización y una especialidad ajena dan 404 sin escribir", async () => {
    const world = await createWorld("attends-idor");
    const stranger = await createWorld("attends-idor-stranger");
    const otherOrganizationId = await createOrganizationResource(world.admin);
    const otherClinicId = await createClinicResourceViaPrisma(
      world.admin,
      otherOrganizationId,
    );

    const fromStranger = await assign(
      stranger.admin.context,
      world.clinicId,
      stranger.admin,
      { role: "DOCTOR", specialtyIds: [stranger.specialtyId] },
    );
    const foreignSpecialty = await assign(
      world.admin.context,
      otherClinicId,
      world.admin,
      { role: "DOCTOR", specialtyIds: [world.specialtyId] },
    );

    expect(fromStranger.status()).toBe(404);
    expect(foreignSpecialty.status()).toBe(404);
    expect(await profileOf(world.admin.userId, otherClinicId)).toBeNull();
    expect(await profileOf(stranger.admin.userId, world.clinicId)).toBeNull();
  });

  test("ADMIN en una sede responde 400 sin escribir", async () => {
    const world = await createWorld("attends-admin-role");
    const person = await createMemberOf(world, world.organizationId, "USER");

    const response = await assign(world.admin.context, world.clinicId, person, {
      role: "ADMIN",
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("Médico, Usuario y de vuelta a Médico", () => {
  test("pasar a Usuario lo saca del booking y volver a Médico reactiva el mismo perfil", async () => {
    const world = await createWorld("attends-roundtrip");
    const person = await createMemberOf(world, world.organizationId, "USER");
    const first = await assign(world.admin.context, world.clinicId, person, {
      role: "DOCTOR",
      specialtyIds: [world.specialtyId],
    });
    expect(first.status()).toBe(200);
    await seedFullDayAvailability(person.userId, world.clinicId);
    const profile = await profileOf(person.userId, world.clinicId);
    expect(await listedProfileIds(world.clinicId)).toContain(profile?.id);

    const demoted = await assign(world.admin.context, world.clinicId, person, {
      role: "USER",
    });
    expect(demoted.status()).toBe(200);
    expect(await demoted.json()).toMatchObject({ outcome: "updated" });
    expect(await listedProfileIds(world.clinicId)).not.toContain(profile?.id);

    const promoted = await assign(world.admin.context, world.clinicId, person, {
      role: "DOCTOR",
      specialtyIds: [world.specialtyId],
    });
    expect(promoted.status()).toBe(200);
    expect((await profileOf(person.userId, world.clinicId))?.id).toBe(
      profile?.id,
    );
    expect(await listedProfileIds(world.clinicId)).toContain(profile?.id);
  });
});

test.describe("GET /user/me/profile para quien edita especialidades", () => {
  test("editableClinics sólo trae las sedes donde atiende, con doctorProfileId y sin isClinicDoctor", async () => {
    const world = await createWorld("attends-profile");
    await createClinicResourceViaPrisma(world.admin, world.organizationId);
    expect((await getProfile(world.admin.context)).editableClinics).toEqual([]);

    await assignSelf(world, world.admin, [world.specialtyId]);

    const { editableClinics } = await getProfile(world.admin.context);
    expect(editableClinics).toHaveLength(1);
    expect(Object.keys(editableClinics[0]).sort()).toEqual([
      "clinicId",
      "clinicName",
      "doctorProfileId",
      "hasSchedule",
      "organizationId",
      "organizationName",
      "specialties",
    ]);
    const profile = await profileOf(world.admin.userId, world.clinicId);
    expect(editableClinics[0]).toMatchObject({
      clinicId: world.clinicId,
      doctorProfileId: profile?.id,
      hasSchedule: false,
    });
  });

  test("hasSchedule pasa a true con un horario", async () => {
    const world = await createWorld("attends-schedule");
    await assignSelf(world, world.admin, [world.specialtyId]);

    await seedFullDayAvailability(world.admin.userId, world.clinicId);

    const { editableClinics } = await getProfile(world.admin.context);
    expect(editableClinics[0].hasSchedule).toBe(true);
  });
});

test.describe("Efectos en otras rutas", () => {
  test("CA-32: el tratamiento da 403 al ADMIN que no atiende y 200 después de asignarse", async () => {
    const world = await createWorld("attends-treatment");
    const body = {
      name: "Marta",
      lastName: "Quispe",
      phone: "+51912345678",
      treatment: "DRA",
    };
    const bareOwner = await createOnboardedAdmin({
      emailPrefix: "attends-ca32",
    });

    expect(
      (await world.admin.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(403);
    expect(
      (await bareOwner.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(403);

    await assignSelf(world, world.admin, [world.specialtyId]);

    expect(
      (await world.admin.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(200);
  });

  test("la ruta me/specialties ya no existe: 401", async () => {
    const world = await createWorld("attends-gone");

    const response = await world.admin.context.put(
      `${API_BASE_URL}/organization/${world.organizationId}/clinics/${world.clinicId}/me/specialties`,
      { data: { specialtyIds: [world.specialtyId] } },
    );

    expect(response.status()).toBe(401);
  });

  test("un DOCTOR no puede editar sus especialidades por la ruta del médico: 403", async () => {
    const world = await createWorld("attends-doctor-put");
    const [alfa] = world.specialties;

    const response = await putDoctorSpecialties(
      await signInAs(world.doctor.userId),
      world,
      world.doctor.doctorProfileId,
      [alfa.id],
    );

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
  });
});
