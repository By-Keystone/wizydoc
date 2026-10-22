import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  inviteUserViaApi,
  type SeedMembershipRole,
} from "../../support/accounts";
import {
  createPortalScenario,
  type PortalScenario,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { seedPatient } from "../../support/doctor-treatment";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { expect, test } from "../../support/test";
import { signIn, uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 3: CA-14 a CA-34.

const PROFILE_URL = `${API_BASE_URL}/user/me/profile`;
const FORBIDDEN = {
  message: "Solo un administrador puede cambiar especialidades.",
  code: "FORBIDDEN",
};

interface NamedSpecialty {
  id: string;
  name: string;
}

interface ProfileClinic {
  clinicId: string;
  clinicName: string;
  organizationName: string;
  specialties: NamedSpecialty[];
}

interface EditableClinic extends ProfileClinic {
  organizationId: string;
  isClinicDoctor: boolean;
  hasSchedule: boolean;
}

interface ProfileOrganization {
  organizationId: string;
  organizationName: string;
  specialties: NamedSpecialty[];
  canCreateSpecialties: boolean;
}

interface Profile {
  clinics: ProfileClinic[];
  editableClinics: EditableClinic[];
  organizations: ProfileOrganization[];
}

interface World extends PortalScenario {
  specialties: NamedSpecialty[];
}

function byName(a: NamedSpecialty, b: NamedSpecialty) {
  return a.name.localeCompare(b.name, "es");
}

function putUrl(organizationId: string, clinicId: string) {
  return `${API_BASE_URL}/organization/${organizationId}/clinics/${clinicId}/me/specialties`;
}

function put(
  context: APIRequestContext,
  organizationId: string,
  clinicId: string,
  specialtyIds: unknown,
) {
  return context.put(putUrl(organizationId, clinicId), {
    data: { specialtyIds },
  });
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

async function createOrgAdmin(world: World, prefix = "org-admin") {
  return createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId: world.organizationId,
    role: "ADMIN",
    createdBy: world.admin.userId,
    emailPrefix: prefix,
  });
}

async function createMemberOf(
  world: World,
  resourceId: string,
  role: SeedMembershipRole,
) {
  return createMemberWithRole({
    accountId: world.admin.accountId,
    resourceId,
    role,
    createdBy: world.admin.userId,
    emailPrefix: `me-${role.toLowerCase()}`,
  });
}

async function createOtherOrganization(world: World) {
  const organizationId = await createOrganizationResource(world.admin);
  const clinicId = await createClinicResourceViaPrisma(
    world.admin,
    organizationId,
  );
  const specialty = await namedSpecialty(world, organizationId, "Ajena");
  return { organizationId, clinicId, specialty };
}

async function profileOf(userId: string, clinicId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: { id: true, specialties: { select: { id: true } } },
  });
  if (!profile) return null;
  return {
    id: profile.id,
    specialtyIds: profile.specialties.map((s: { id: string }) => s.id).sort(),
  };
}

async function snapshot(clinicIds: string[]) {
  const prisma = await getTestPrisma();
  const profiles = await prisma.doctorProfile.findMany({
    where: { clinicId: { in: clinicIds } },
    select: {
      id: true,
      userId: true,
      clinicId: true,
      specialties: { select: { id: true } },
    },
  });
  return profiles
    .map(
      (p: {
        id: string;
        userId: string;
        clinicId: string;
        specialties: { id: string }[];
      }) => ({
        ...p,
        specialties: p.specialties.map((s) => s.id).sort(),
      }),
    )
    .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
}

async function getProfile(context: APIRequestContext) {
  const response = await context.get(PROFILE_URL);
  expect(response.status()).toBe(200);
  return (await response.json()) as Profile;
}

async function expectRejectedWithoutChanges(
  response: Awaited<ReturnType<typeof put>>,
  status: number,
  message: string,
  clinicIds: string[],
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(response.status()).toBe(status);
  expect(((await response.json()) as { message: string }).message).toBe(
    message,
  );
  expect(await snapshot(clinicIds)).toEqual(before);
}

async function removeAllMemberships(userId: string) {
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId },
    data: { deletedAt: new Date() },
  });
}

test.describe("PUT me/specialties: guardar", () => {
  test("CA-14: el ADMIN sin perfil envía dos especialidades, recibe 200 ordenadas por nombre y queda un solo perfil", async () => {
    const world = await createWorld("own-ca14");
    const [alfa, , zeta] = world.specialties;
    const before = await snapshot([world.clinicId]);
    expect(await profileOf(world.admin.userId, world.clinicId)).toBeNull();

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      [zeta.id, alfa.id],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [alfa, zeta] });
    const profile = await profileOf(world.admin.userId, world.clinicId);
    expect(profile?.specialtyIds).toEqual([alfa.id, zeta.id].sort());
    const after = await snapshot([world.clinicId]);
    expect(after).toHaveLength(before.length + 1);
    expect(
      after.filter((p: { userId: string }) => p.userId === world.admin.userId),
    ).toHaveLength(1);
  });

  test("CA-15: un segundo PUT reemplaza la lista, repetidos se guardan una vez y [] deja el perfil vacío", async () => {
    const world = await createWorld("own-ca15");
    const [alfa, main, zeta] = world.specialties;
    const { admin, organizationId, clinicId } = world;
    await put(admin.context, organizationId, clinicId, [alfa.id, main.id]);
    const profileId = (await profileOf(admin.userId, clinicId))?.id;

    const replaced = await put(admin.context, organizationId, clinicId, [
      zeta.id,
      zeta.id,
      zeta.id,
    ]);
    expect(replaced.status()).toBe(200);
    expect(await replaced.json()).toEqual({ specialties: [zeta] });
    expect(await profileOf(admin.userId, clinicId)).toEqual({
      id: profileId,
      specialtyIds: [zeta.id],
    });

    const emptied = await put(admin.context, organizationId, clinicId, []);
    expect(emptied.status()).toBe(200);
    expect(await emptied.json()).toEqual({ specialties: [] });
    expect(await profileOf(admin.userId, clinicId)).toEqual({
      id: profileId,
      specialtyIds: [],
    });
  });

  test("CA-15: la lista vacía como primer guardado crea el perfil sin especialidades", async () => {
    const world = await createWorld("own-ca15-first-empty");

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      [],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [] });
    const profile = await profileOf(world.admin.userId, world.clinicId);
    expect(profile?.specialtyIds).toEqual([]);
  });

  test("CA-16: dos primeros PUT simultáneos responden 200 y dejan un solo perfil con la lista de uno de los dos", async () => {
    const world = await createWorld("own-ca16");
    const [alfa, , zeta] = world.specialties;
    const { admin, organizationId, clinicId } = world;

    const [first, second] = await Promise.all([
      put(admin.context, organizationId, clinicId, [alfa.id]),
      put(admin.context, organizationId, clinicId, [zeta.id]),
    ]);

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const mine = (await snapshot([clinicId])).filter(
      (p: { userId: string }) => p.userId === admin.userId,
    );
    expect(mine).toHaveLength(1);
    expect([[alfa.id], [zeta.id]]).toContainEqual(mine[0].specialties);
  });

  test("CA-17: el dueño sin membership edita las suyas en su organización y en otra de su cuenta", async () => {
    const world = await createWorld("own-ca17");
    const other = await createOtherOrganization(world);
    await removeAllMemberships(world.admin.userId);
    const { admin } = world;

    const own = await put(admin.context, world.organizationId, world.clinicId, [
      world.specialties[0].id,
    ]);
    const foreign = await put(
      admin.context,
      other.organizationId,
      other.clinicId,
      [other.specialty.id],
    );

    expect(own.status()).toBe(200);
    expect(foreign.status()).toBe(200);
    expect(await foreign.json()).toEqual({ specialties: [other.specialty] });
    expect(
      (await profileOf(admin.userId, other.clinicId))?.specialtyIds,
    ).toEqual([other.specialty.id]);
  });

  test("las citas ya reservadas del ADMIN no cambian al reemplazar sus especialidades", async () => {
    const world = await createWorld("own-appointments");
    const { admin, organizationId, clinicId } = world;
    const [alfa, main] = world.specialties;
    await put(admin.context, organizationId, clinicId, [main.id, alfa.id]);
    const profileId = await seedFullDayAvailability(admin.userId, clinicId);
    const prisma = await getTestPrisma();
    await prisma.appointment.create({
      data: {
        doctorProfileId: profileId,
        clinicId,
        patientId: await seedPatient(admin.accountId),
        scheduledAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        durationMinutes: 30,
        specialty: main.name,
      },
    });
    const before = await prisma.appointment.findMany({
      where: { doctorProfileId: profileId },
    });
    expect(before).toHaveLength(1);

    const response = await put(admin.context, organizationId, clinicId, [
      alfa.id,
    ]);

    expect(response.status()).toBe(200);
    expect(
      await prisma.appointment.findMany({
        where: { doctorProfileId: profileId },
      }),
    ).toEqual(before);
  });

  test("CA-22: un PUT válido quita la especialidad de otra organización que el perfil tenía ligada", async () => {
    const world = await createWorld("own-ca22");
    const other = await createOtherOrganization(world);
    const [alfa] = world.specialties;
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.create({
      data: {
        userId: world.admin.userId,
        clinicId: world.clinicId,
        specialties: { connect: [{ id: other.specialty.id }, { id: alfa.id }] },
      },
    });

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      [alfa.id],
    );

    expect(response.status()).toBe(200);
    expect(
      (await profileOf(world.admin.userId, world.clinicId))?.specialtyIds,
    ).toEqual([alfa.id]);
  });
});

test.describe("PUT me/specialties: quién no puede (IDOR)", () => {
  test("CA-18: DOCTOR, USER de sede, USER de organización y ADMIN de sede reciben 403 FORBIDDEN sin cambios", async () => {
    const world = await createWorld("own-ca18");
    const [alfa] = world.specialties;
    const actors = [
      await createMemberOf(world, world.clinicId, "DOCTOR"),
      await createMemberOf(world, world.clinicId, "USER"),
      await createMemberOf(world, world.organizationId, "USER"),
      await createMemberOf(world, world.clinicId, "ADMIN"),
    ];
    const before = await snapshot([world.clinicId]);

    for (const actor of actors) {
      const response = await put(
        actor.context,
        world.organizationId,
        world.clinicId,
        [alfa.id],
      );

      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual(FORBIDDEN);
    }
    expect(await snapshot([world.clinicId])).toEqual(before);
  });

  test("CA-18: un DOCTOR con perfil y especialidades no puede cambiarlas ni vaciarlas", async () => {
    const world = await createWorld("own-ca18-doctor");
    const before = await snapshot([world.clinicId]);
    const doctorContext = await createApiContext();
    const prisma = await getTestPrisma();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: world.doctor.userId },
    });
    await signIn(doctorContext, user.email);

    for (const ids of [[world.specialties[0].id], []]) {
      const response = await put(
        doctorContext,
        world.organizationId,
        world.clinicId,
        ids,
      );
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual(FORBIDDEN);
    }
    expect(await snapshot([world.clinicId])).toEqual(before);
  });

  test("CA-19: el ADMIN de una organización recibe 403 contra la sede de otra organización de la misma cuenta", async () => {
    const world = await createWorld("own-ca19");
    const other = await createOtherOrganization(world);
    const orgAdmin = await createOrgAdmin(world);
    const clinics = [world.clinicId, other.clinicId];
    const before = await snapshot(clinics);

    const response = await put(
      orgAdmin.context,
      other.organizationId,
      other.clinicId,
      [other.specialty.id],
    );

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
    expect(await snapshot(clinics)).toEqual(before);
  });

  test("CA-20: el intruso de otra cuenta con los ids reales de la víctima recibe 404 «Sede no encontrada»", async () => {
    const victim = await createWorld("own-ca20-victim");
    const intruder = await createWorld("own-ca20-intruder");
    const before = await snapshot([victim.clinicId, intruder.clinicId]);

    for (const [organizationId, clinicId] of [
      [victim.organizationId, victim.clinicId],
      [intruder.organizationId, victim.clinicId],
    ]) {
      const response = await put(
        intruder.admin.context,
        organizationId,
        clinicId,
        [victim.specialties[0].id],
      );
      await expectRejectedWithoutChanges(
        response,
        404,
        "Sede no encontrada",
        [victim.clinicId, intruder.clinicId],
        before,
      );
    }
  });

  test("CA-20: la sede de otra organización bajo el resourceId propio y una sede como resourceId dan 404 «Sede no encontrada»", async () => {
    const world = await createWorld("own-ca20-scope");
    const other = await createOtherOrganization(world);
    const orgAdmin = await createOrgAdmin(world);
    const clinics = [world.clinicId, other.clinicId];
    const before = await snapshot(clinics);

    const wrongParent = await put(
      orgAdmin.context,
      world.organizationId,
      other.clinicId,
      [world.specialties[0].id],
    );
    await expectRejectedWithoutChanges(
      wrongParent,
      404,
      "Sede no encontrada",
      clinics,
      before,
    );

    const clinicAsOrganization = await put(
      world.admin.context,
      world.clinicId,
      world.clinicId,
      [world.specialties[0].id],
    );
    await expectRejectedWithoutChanges(
      clinicAsOrganization,
      404,
      "Sede no encontrada",
      clinics,
      before,
    );

    const unknownClinic = await put(
      world.admin.context,
      world.organizationId,
      randomUUID(),
      [world.specialties[0].id],
    );
    await expectRejectedWithoutChanges(
      unknownClinic,
      404,
      "Sede no encontrada",
      clinics,
      before,
    );
  });

  test("CA-21: una especialidad de otra organización, de otra cuenta o inexistente, sola o con una propia, da 404 sin cambios", async () => {
    const world = await createWorld("own-ca21");
    const stranger = await createWorld("own-ca21-stranger");
    const other = await createOtherOrganization(world);
    const [alfa, main] = world.specialties;
    await put(world.admin.context, world.organizationId, world.clinicId, [
      main.id,
    ]);
    const clinics = [world.clinicId];
    const before = await snapshot(clinics);
    const foreignIds = [
      other.specialty.id,
      stranger.specialties[0].id,
      randomUUID(),
    ];

    for (const foreignId of foreignIds) {
      for (const ids of [[foreignId], [alfa.id, foreignId]]) {
        const response = await put(
          world.admin.context,
          world.organizationId,
          world.clinicId,
          ids,
        );
        await expectRejectedWithoutChanges(
          response,
          404,
          "Especialidad no encontrada",
          clinics,
          before,
        );
      }
    }
  });

  test("CA-31: sin la membership de ADMIN (borrada) sus sedes dejan de aparecer, el PUT da 403 y su perfil sigue en la base", async () => {
    const world = await createWorld("own-ca31");
    const orgAdmin = await createOrgAdmin(world);
    const [alfa, , zeta] = world.specialties;
    await put(orgAdmin.context, world.organizationId, world.clinicId, [
      alfa.id,
    ]);
    expect((await getProfile(orgAdmin.context)).editableClinics).toHaveLength(
      1,
    );
    await softDeleteMembership(orgAdmin.membershipId);
    const before = await snapshot([world.clinicId]);

    const response = await put(
      orgAdmin.context,
      world.organizationId,
      world.clinicId,
      [zeta.id],
    );

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual(FORBIDDEN);
    expect((await getProfile(orgAdmin.context)).editableClinics).toEqual([]);
    expect(await snapshot([world.clinicId])).toEqual(before);
    expect(
      (await profileOf(orgAdmin.userId, world.clinicId))?.specialtyIds,
    ).toEqual([alfa.id]);
  });
});

test.describe("PUT me/specialties: validación y acceso", () => {
  test("CA-23: una clave de más, un id que no es uuid y 51 ids dan 400 sin cambios", async () => {
    const world = await createWorld("own-ca23");
    const [alfa] = world.specialties;
    const { admin, organizationId, clinicId } = world;
    await put(admin.context, organizationId, clinicId, [alfa.id]);
    const before = await snapshot([clinicId]);
    const bodies: unknown[] = [
      { specialtyIds: [alfa.id], userId: world.doctor.userId },
      { specialtyIds: [alfa.id], doctorProfileId: randomUUID() },
      { specialtyIds: ["no-es-uuid"] },
      { specialtyIds: [alfa.id, 7] },
      { specialtyIds: Array.from({ length: 51 }, () => randomUUID()) },
      { specialtyIds: alfa.id },
      {},
    ];

    for (const data of bodies) {
      const response = await admin.context.put(
        putUrl(organizationId, clinicId),
        { data },
      );
      expect(response.status(), JSON.stringify(data).slice(0, 80)).toBe(400);
    }
    expect(await snapshot([clinicId])).toEqual(before);
  });

  test("CA-23: un resourceId o un clinicId que no son uuid dan 400 sin cambios", async () => {
    const world = await createWorld("own-ca23-params");
    const before = await snapshot([world.clinicId]);
    const { admin } = world;

    for (const [organizationId, clinicId] of [
      ["no-es-uuid", world.clinicId],
      [world.organizationId, "no-es-uuid"],
    ]) {
      const response = await put(admin.context, organizationId, clinicId, [
        world.specialties[0].id,
      ]);
      expect(response.status()).toBe(400);
    }
    expect(await snapshot([world.clinicId])).toEqual(before);
  });

  test("CA-23: 50 ids válidos se aceptan", async () => {
    const world = await createWorld("own-ca23-fifty");
    const prisma = await getTestPrisma();
    const suffix = randomUUID().slice(0, 8);
    await prisma.specialty.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        name: `Masiva ${suffix} ${String(index).padStart(2, "0")}`,
        organizationId: world.organizationId,
      })),
    });
    const created = await prisma.specialty.findMany({
      where: { name: { startsWith: `Masiva ${suffix}` } },
      select: { id: true },
    });
    expect(created).toHaveLength(50);

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      created.map((specialty: { id: string }) => specialty.id),
    );

    expect(response.status()).toBe(200);
    expect(
      ((await response.json()) as { specialties: unknown[] }).specialties,
    ).toHaveLength(50);
  });

  test("CA-24: sin sesión 401; sin confirmar o sin onboarding 403, sin cambios", async () => {
    const world = await createWorld("own-ca24");
    const [alfa] = world.specialties;
    const before = await snapshot([world.clinicId]);

    const anonymous = await createApiContext();
    expect(
      (
        await put(anonymous, world.organizationId, world.clinicId, [alfa.id])
      ).status(),
    ).toBe(401);

    const prisma = await getTestPrisma();
    for (const flag of [{ confirmed: false }, { onboardingCompleted: false }]) {
      const orgAdmin = await createOrgAdmin(world);
      await prisma.user.update({ where: { id: orgAdmin.userId }, data: flag });

      const response = await put(
        orgAdmin.context,
        world.organizationId,
        world.clinicId,
        [alfa.id],
      );

      expect(response.status()).toBe(403);
    }
    expect(await snapshot([world.clinicId])).toEqual(before);
  });
});

test.describe("GET /user/me/profile para quien edita especialidades", () => {
  test("CA-25: el ADMIN recibe exactamente las claves nuevas y ningún id de usuario, cuenta ni rol", async () => {
    const world = await createWorld("own-ca25");

    const response = await world.admin.context.get(PROFILE_URL);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as Profile;
    expect(Object.keys(body).sort()).toEqual([
      "clinics",
      "doctorDisplayName",
      "editableClinics",
      "email",
      "lastName",
      "name",
      "organizations",
      "phone",
      "treatment",
    ]);
    expect(Object.keys(body.editableClinics[0]).sort()).toEqual([
      "clinicId",
      "clinicName",
      "hasSchedule",
      "isClinicDoctor",
      "organizationId",
      "organizationName",
      "specialties",
    ]);
    expect(Object.keys(body.organizations[0]).sort()).toEqual([
      "canCreateSpecialties",
      "organizationId",
      "organizationName",
      "specialties",
    ]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(world.admin.userId);
    expect(raw).not.toContain(world.admin.accountId);
    expect(raw).not.toContain("ADMIN");
  });

  test("CA-26: con dos sedes, una con especialidades y otra sin perfil, ve las dos en editableClinics", async () => {
    const world = await createWorld("own-ca26");
    const secondClinicId = await createClinicResourceViaPrisma(
      world.admin,
      world.organizationId,
    );
    const [alfa, , zeta] = world.specialties;
    await put(world.admin.context, world.organizationId, world.clinicId, [
      zeta.id,
      alfa.id,
    ]);

    const { editableClinics: clinics } = await getProfile(world.admin.context);

    expect(clinics).toHaveLength(2);
    const first = clinics.find((c) => c.clinicId === world.clinicId);
    const second = clinics.find((c) => c.clinicId === secondClinicId);
    expect(first).toMatchObject({
      organizationId: world.organizationId,
      specialties: [alfa, zeta],
      isClinicDoctor: false,
      hasSchedule: false,
    });
    expect(second).toMatchObject({
      organizationId: world.organizationId,
      specialties: [],
      isClinicDoctor: false,
      hasSchedule: false,
    });
  });

  test("CA-27: organizations trae solo las organizaciones que edita, con sus especialidades por nombre y canCreateSpecialties según el rol", async () => {
    const world = await createWorld("own-ca27");
    const other = await createOtherOrganization(world);
    const stranger = await createWorld("own-ca27-stranger");
    const orgAdmin = await createOrgAdmin(world);
    const owner = world.admin;
    await removeAllMemberships(owner.userId);
    const mainOrganization = {
      organizationId: world.organizationId,
      specialties: world.specialties,
    };

    const ownerView = (await getProfile(owner.context)).organizations;
    expect(ownerView).toHaveLength(2);
    expect(
      ownerView.map(({ organizationName: _name, ...rest }) => rest),
    ).toEqual(
      expect.arrayContaining([
        { ...mainOrganization, canCreateSpecialties: false },
        {
          organizationId: other.organizationId,
          specialties: [other.specialty],
          canCreateSpecialties: false,
        },
      ]),
    );
    expect(JSON.stringify(ownerView)).not.toContain(stranger.specialties[0].id);

    const adminView = (await getProfile(orgAdmin.context)).organizations;
    expect(adminView).toHaveLength(1);
    const { organizationName: _name, ...adminOrganization } = adminView[0];
    expect(adminOrganization).toEqual({
      ...mainOrganization,
      canCreateSpecialties: true,
    });

    for (const [resourceId, role] of [
      [world.clinicId, "DOCTOR"],
      [world.clinicId, "USER"],
      [world.clinicId, "ADMIN"],
      [world.organizationId, "USER"],
    ] as const) {
      const member = await createMemberOf(world, resourceId, role);
      expect((await getProfile(member.context)).organizations).toEqual([]);
    }
  });

  test("CA-28: el DOCTOR ve sus sedes sin poder editar y el ADMIN de sede solo ve la suya si tiene perfil", async () => {
    const world = await createWorld("own-ca28");
    const prisma = await getTestPrisma();
    const doctor = await createMemberOf(world, world.clinicId, "DOCTOR");
    await prisma.doctorProfile.create({
      data: {
        userId: doctor.userId,
        clinicId: world.clinicId,
        specialties: { connect: [{ id: world.specialties[0].id }] },
      },
    });
    const clinicAdmin = await createMemberOf(world, world.clinicId, "ADMIN");
    const withoutProfile = await getProfile(clinicAdmin.context);
    expect(withoutProfile.clinics).toEqual([]);
    expect(withoutProfile.editableClinics).toEqual([]);

    await prisma.doctorProfile.create({
      data: {
        userId: clinicAdmin.userId,
        clinicId: world.clinicId,
        specialties: { connect: [{ id: world.specialties[1].id }] },
      },
    });

    const doctorClinics = (await getProfile(doctor.context)).clinics;
    expect(doctorClinics).toHaveLength(1);
    expect(doctorClinics[0]).toMatchObject({
      clinicId: world.clinicId,
    });
    expect((await getProfile(doctor.context)).editableClinics).toEqual([]);
    const adminClinics = (await getProfile(clinicAdmin.context)).clinics;
    expect(adminClinics).toHaveLength(1);
    expect(adminClinics[0]).toMatchObject({
      clinicId: world.clinicId,
      specialties: [world.specialties[1]],
    });
    expect((await getProfile(clinicAdmin.context)).editableClinics).toEqual([]);
  });

  test("CA-29: hasSchedule pasa a true solo en la sede donde el perfil tiene un horario", async () => {
    const world = await createWorld("own-ca29");
    const secondClinicId = await createClinicResourceViaPrisma(
      world.admin,
      world.organizationId,
    );
    const { admin, organizationId } = world;
    for (const clinicId of [world.clinicId, secondClinicId]) {
      await put(admin.context, organizationId, clinicId, [
        world.specialties[0].id,
      ]);
    }
    const flags = async () =>
      Object.fromEntries(
        (await getProfile(admin.context)).editableClinics.map((c) => [
          c.clinicId,
          c.hasSchedule,
        ]),
      );
    expect(await flags()).toEqual({
      [world.clinicId]: false,
      [secondClinicId]: false,
    });

    await seedFullDayAvailability(admin.userId, world.clinicId);

    expect(await flags()).toEqual({
      [world.clinicId]: true,
      [secondClinicId]: false,
    });
  });

  test("CA-30: un ADMIN de la organización que además es DOCTOR de una sede la recibe una sola vez, editable y como médico", async () => {
    const world = await createWorld("own-ca30");
    const orgAdmin = await createOrgAdmin(world);
    const prisma = await getTestPrisma();
    await prisma.userResourceMembership.create({
      data: {
        userId: orgAdmin.userId,
        resourceId: world.clinicId,
        accountId: world.admin.accountId,
        role: "DOCTOR",
        createdBy: world.admin.userId,
      },
    });
    await prisma.doctorProfile.create({
      data: {
        userId: orgAdmin.userId,
        clinicId: world.clinicId,
        specialties: { connect: [{ id: world.specialties[0].id }] },
      },
    });

    const { editableClinics } = await getProfile(orgAdmin.context);

    expect(editableClinics).toHaveLength(1);
    expect(editableClinics[0]).toMatchObject({
      clinicId: world.clinicId,
      isClinicDoctor: true,
      specialties: [world.specialties[0]],
    });
  });
});

test.describe("Efectos en otras rutas", () => {
  test("CA-32: PATCH con «DRA» da 200 al ADMIN con una sede y 403 al dueño sin organización y al USER", async () => {
    const world = await createWorld("own-ca32");
    const body = {
      name: "Marta",
      lastName: "Quispe",
      phone: "+51912345678",
      treatment: "DRA",
    };
    const orgAdmin = await createOrgAdmin(world);
    const bareOwner = await createOnboardedAdmin({ emailPrefix: "own-ca32" });
    const user = await createMemberOf(world, world.organizationId, "USER");

    expect(
      (await orgAdmin.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(200);
    expect(
      (await world.admin.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(200);
    expect(
      (await bareOwner.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(403);
    expect(
      (await user.context.patch(PROFILE_URL, { data: body })).status(),
    ).toBe(403);
  });

  test("CA-33: en Gratis, tras guardar sus especialidades el ADMIN aún puede invitar a su DOCTOR", async () => {
    const admin = await createOnboardedAdmin({ emailPrefix: "own-ca33" });
    const organizationId = await createOrganizationResource(admin);
    const clinicId = await createClinicResourceViaPrisma(admin, organizationId);
    const specialtyId = await createSpecialty(admin, organizationId);
    const saved = await put(admin.context, organizationId, clinicId, [
      specialtyId,
    ]);
    expect(saved.status()).toBe(200);

    const invited = await inviteUserViaApi(admin, {
      email: `own-ca33-doctor-${randomUUID().slice(0, 8)}@e2e.wizydoc.test`,
      name: "Dora",
      lastName: "Doctora",
      phone: "+51900000033",
      role: "DOCTOR",
      resourceId: clinicId,
      specialtyIds: [specialtyId],
    });

    expect(invited.ok()).toBe(true);
  });
});
