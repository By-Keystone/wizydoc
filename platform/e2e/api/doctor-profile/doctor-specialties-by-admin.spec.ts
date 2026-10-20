import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import {
  createApiContext,
  createClinicResourceViaPrisma,
  createMemberWithRole,
  createOrganizationResource,
  createSpecialty,
  type SeedMembershipRole,
} from "../../support/accounts";
import {
  addPortalDoctor,
  createManagedAppointment,
  createPortalClient,
  createPortalScenario,
  limaWallTime,
  limaWallTimeInDays,
  readAppointment,
  type PortalScenario,
} from "../../support/appointment-portal";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import {
  invitePendingUser,
  softDeleteMembership,
} from "../../support/invitations";
import { expect, test } from "../../support/test";
import { signIn, uniqueName } from "../../support/users";

// docs/features/doctor-profile-specialties/plan.md, PR 4: CA-36 a CA-50.

const FORBIDDEN = {
  message: "Solo un administrador puede cambiar especialidades.",
  code: "FORBIDDEN",
};
const OWN_SPECIALTIES = {
  message: "Tus especialidades se editan en «Mi perfil».",
  code: "OWN_SPECIALTIES",
};
const DOCTOR_NOT_FOUND = "Médico no encontrado";
const CLINIC_NOT_FOUND = "Sede no encontrada";
const SPECIALTY_NOT_FOUND = "Especialidad no encontrada";

interface NamedSpecialty {
  id: string;
  name: string;
}

interface World extends PortalScenario {
  specialties: NamedSpecialty[];
}

interface UserRow {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  doctorProfileId: string | null;
  specialties: NamedSpecialty[];
}

interface PublicDoctor {
  doctorProfileId: string;
  specialties: NamedSpecialty[];
}

function byName(a: NamedSpecialty, b: NamedSpecialty) {
  return a.name.localeCompare(b.name, "es");
}

function putUrl(organizationId: string, clinicId: string, profileId: string) {
  return `${API_BASE_URL}/organization/${organizationId}/clinics/${clinicId}/doctors/${profileId}/specialties`;
}

function put(
  context: APIRequestContext,
  organizationId: string,
  clinicId: string,
  profileId: string,
  specialtyIds: unknown,
) {
  return context.put(putUrl(organizationId, clinicId, profileId), {
    data: { specialtyIds },
  });
}

async function namedSpecialty(
  scenario: PortalScenario,
  organizationId: string,
  prefix: string,
): Promise<NamedSpecialty> {
  const name = uniqueName(prefix);
  return {
    id: await createSpecialty(scenario.admin, organizationId, name),
    name,
  };
}

// Alfa y Zeta rodean al nombre de la especialidad del escenario para fijar el orden.
async function createWorld(label: string): Promise<World> {
  const scenario = await createPortalScenario(label);
  const alfa = await namedSpecialty(scenario, scenario.organizationId, "Alfa");
  const zeta = await namedSpecialty(scenario, scenario.organizationId, "Zeta");
  const main = { id: scenario.specialtyId, name: scenario.specialtyName };
  return { ...scenario, specialties: [alfa, main, zeta].sort(byName) };
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
    emailPrefix: `by-admin-${role.toLowerCase()}`,
  });
}

function createOrgAdmin(world: World) {
  return createMemberOf(world, world.organizationId, "ADMIN");
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
  const memberships = await prisma.userResourceMembership.findMany({
    where: { resourceId: { in: clinicIds } },
    select: { id: true, role: true, deletedAt: true },
  });
  const sortById = (a: { id: string }, b: { id: string }) =>
    a.id.localeCompare(b.id);
  return {
    profiles: profiles
      .map((p: { specialties: { id: string }[] }) => ({
        ...p,
        specialties: p.specialties.map((s) => s.id).sort(),
      }))
      .sort(sortById),
    memberships: memberships.sort(sortById),
  };
}

async function specialtyIdsOf(profileId: string) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: { specialties: { select: { id: true } } },
  });
  return profile.specialties.map((s: { id: string }) => s.id).sort();
}

async function expectRejectedWithoutChanges(
  response: Awaited<ReturnType<typeof put>>,
  status: number,
  expected: string | Record<string, string>,
  clinicIds: string[],
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(response.status()).toBe(status);
  const body = (await response.json()) as { message: string };
  if (typeof expected === "string") expect(body.message).toBe(expected);
  else expect(body).toEqual(expected);
  expect(await snapshot(clinicIds)).toEqual(before);
}

async function listPublicDoctors(clinicId: string): Promise<PublicDoctor[]> {
  const anonymous = await createApiContext();
  const response = await anonymous.get(
    `${API_BASE_URL}/clinic/${clinicId}/doctors`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as PublicDoctor[];
}

async function listClinicUsers(
  context: APIRequestContext,
  clinicId: string,
): Promise<UserRow[]> {
  const response = await context.get(
    `${API_BASE_URL}/clinic/${clinicId}/users`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as UserRow[];
}

async function removeAllMemberships(userId: string) {
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.updateMany({
    where: { userId },
    data: { deletedAt: new Date() },
  });
}

async function createProfile(
  userId: string,
  clinicId: string,
  specialtyIds: string[] = [],
) {
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.create({
    data: {
      userId,
      clinicId,
      specialties: { connect: specialtyIds.map((id) => ({ id })) },
    },
  });
  return profile.id as string;
}

test.describe("PUT doctors/:doctorProfileId/specialties: quién puede", () => {
  test("CA-36: el ADMIN de la organización reemplaza las especialidades de un DOCTOR y el booking las muestra", async () => {
    const world = await createWorld("by-ca36");
    const [alfa, , zeta] = world.specialties;
    const orgAdmin = await createOrgAdmin(world);
    const { doctorProfileId } = world.doctor;

    const response = await put(
      orgAdmin.context,
      world.organizationId,
      world.clinicId,
      doctorProfileId,
      [zeta.id, alfa.id],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [alfa, zeta] });
    expect(await specialtyIdsOf(doctorProfileId)).toEqual(
      [alfa.id, zeta.id].sort(),
    );
    const listed = (await listPublicDoctors(world.clinicId)).find(
      (d) => d.doctorProfileId === doctorProfileId,
    );
    expect(listed?.specialties.toSorted(byName)).toEqual([alfa, zeta]);
  });

  test("CA-37: el dueño, con y sin membership en la organización, también edita", async () => {
    const world = await createWorld("by-ca37");
    const [alfa, , zeta] = world.specialties;
    const { admin, organizationId, clinicId } = world;
    const { doctorProfileId } = world.doctor;

    const withMembership = await put(
      admin.context,
      organizationId,
      clinicId,
      doctorProfileId,
      [alfa.id],
    );
    expect(withMembership.status()).toBe(200);
    expect(await specialtyIdsOf(doctorProfileId)).toEqual([alfa.id]);

    await removeAllMemberships(admin.userId);
    const withoutMembership = await put(
      admin.context,
      organizationId,
      clinicId,
      doctorProfileId,
      [zeta.id],
    );

    expect(withoutMembership.status()).toBe(200);
    expect(await withoutMembership.json()).toEqual({ specialties: [zeta] });
    expect(await specialtyIdsOf(doctorProfileId)).toEqual([zeta.id]);
  });

  test("CA-38: DOCTOR de la sede, USER de sede, USER de organización y ADMIN de sede reciben 403 FORBIDDEN sin cambios", async () => {
    const world = await createWorld("by-ca38");
    const otherDoctor = await addPortalDoctor({
      label: "by-ca38-otro",
      clinicId: world.clinicId,
      admin: world.admin,
      specialtyId: world.specialtyId,
    });
    const doctorContext = await createApiContext();
    const prisma = await getTestPrisma();
    const doctorUser = await prisma.user.findUniqueOrThrow({
      where: { id: otherDoctor.userId },
    });
    await signIn(doctorContext, doctorUser.email);
    const actors = [
      doctorContext,
      (await createMemberOf(world, world.clinicId, "USER")).context,
      (await createMemberOf(world, world.organizationId, "USER")).context,
      (await createMemberOf(world, world.clinicId, "ADMIN")).context,
    ];
    const before = await snapshot([world.clinicId]);

    for (const actor of actors) {
      const response = await put(
        actor,
        world.organizationId,
        world.clinicId,
        world.doctor.doctorProfileId,
        [world.specialties[0].id],
      );
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual(FORBIDDEN);
    }
    expect(await snapshot([world.clinicId])).toEqual(before);
  });

  test("CA-38: el ADMIN de otra organización de la cuenta y el ADMIN con la membership borrada reciben 403 FORBIDDEN sin cambios", async () => {
    const world = await createWorld("by-ca38-more");
    const other = await createOtherOrganization(world);
    const foreignAdmin = await createMemberOf(
      world,
      other.organizationId,
      "ADMIN",
    );
    const removedAdmin = await createOrgAdmin(world);
    await softDeleteMembership(removedAdmin.membershipId);
    const clinics = [world.clinicId, other.clinicId];
    const before = await snapshot(clinics);

    for (const actor of [foreignAdmin, removedAdmin]) {
      const response = await put(
        actor.context,
        world.organizationId,
        world.clinicId,
        world.doctor.doctorProfileId,
        [world.specialties[0].id],
      );
      await expectRejectedWithoutChanges(
        response,
        403,
        FORBIDDEN,
        clinics,
        before,
      );
    }
  });
});

test.describe("PUT doctors/:doctorProfileId/specialties: médico y sede (IDOR)", () => {
  test("CA-39: un ADMIN de la organización que es DOCTOR de la sede recibe 403 OWN_SPECIALTIES con su propio perfil", async () => {
    const world = await createWorld("by-ca39");
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
    const ownProfileId = await createProfile(orgAdmin.userId, world.clinicId, [
      world.specialties[0].id,
    ]);
    const before = await snapshot([world.clinicId]);

    const response = await put(
      orgAdmin.context,
      world.organizationId,
      world.clinicId,
      ownProfileId,
      [world.specialties[2].id],
    );

    await expectRejectedWithoutChanges(
      response,
      403,
      OWN_SPECIALTIES,
      [world.clinicId],
      before,
    );
  });

  test("CA-40: un ADMIN que no es DOCTOR de la sede recibe 404 «Médico no encontrado» con su propio perfil", async () => {
    const world = await createWorld("by-ca40");
    const orgAdmin = await createOrgAdmin(world);
    const adminProfileId = await createProfile(
      orgAdmin.userId,
      world.clinicId,
      [world.specialties[0].id],
    );
    const ownerProfileId = await createProfile(
      world.admin.userId,
      world.clinicId,
    );
    const before = await snapshot([world.clinicId]);

    const byAdmin = await put(
      orgAdmin.context,
      world.organizationId,
      world.clinicId,
      adminProfileId,
      [world.specialties[2].id],
    );
    await expectRejectedWithoutChanges(
      byAdmin,
      404,
      DOCTOR_NOT_FOUND,
      [world.clinicId],
      before,
    );

    const byOwner = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      ownerProfileId,
      [world.specialties[2].id],
    );
    await expectRejectedWithoutChanges(
      byOwner,
      404,
      DOCTOR_NOT_FOUND,
      [world.clinicId],
      before,
    );
  });

  test("CA-41: perfiles de otra sede, de otra organización, de otra cuenta, sin membership DOCTOR, de un médico quitado o inexistentes dan 404 «Médico no encontrado»", async () => {
    const world = await createWorld("by-ca41");
    const stranger = await createWorld("by-ca41-stranger");
    const other = await createOtherOrganization(world);
    const secondClinicId = await createClinicResourceViaPrisma(
      world.admin,
      world.organizationId,
    );
    const [alfa] = world.specialties;
    const inSecondClinic = await addPortalDoctor({
      label: "by-ca41-sede2",
      clinicId: secondClinicId,
      admin: world.admin,
      specialtyId: world.specialtyId,
    });
    const inOtherOrganization = await addPortalDoctor({
      label: "by-ca41-org2",
      clinicId: other.clinicId,
      admin: world.admin,
      specialtyId: other.specialty.id,
    });
    const removed = await addPortalDoctor({
      label: "by-ca41-quitado",
      clinicId: world.clinicId,
      admin: world.admin,
      specialtyId: world.specialtyId,
    });
    await softDeleteMembership(removed.membershipId);
    const plainUser = await createMemberOf(world, world.clinicId, "USER");
    const userProfileId = await createProfile(
      plainUser.userId,
      world.clinicId,
      [world.specialtyId],
    );
    const clinics = [
      world.clinicId,
      secondClinicId,
      other.clinicId,
      stranger.clinicId,
    ];
    const before = await snapshot(clinics);

    for (const profileId of [
      inSecondClinic.doctorProfileId,
      inOtherOrganization.doctorProfileId,
      stranger.doctor.doctorProfileId,
      userProfileId,
      removed.doctorProfileId,
      randomUUID(),
    ]) {
      const response = await put(
        world.admin.context,
        world.organizationId,
        world.clinicId,
        profileId,
        [alfa.id],
      );
      await expectRejectedWithoutChanges(
        response,
        404,
        DOCTOR_NOT_FOUND,
        clinics,
        before,
      );
    }
  });

  test("CA-42: el intruso con los ids reales de la víctima y la sede de otra organización bajo el resourceId propio dan 404 «Sede no encontrada»", async () => {
    const victim = await createWorld("by-ca42-victim");
    const intruder = await createWorld("by-ca42-intruder");
    const other = await createOtherOrganization(victim);
    const orgAdmin = await createOrgAdmin(victim);
    const clinics = [victim.clinicId, intruder.clinicId, other.clinicId];
    const before = await snapshot(clinics);
    const specialtyIds = [victim.specialties[0].id];

    const attempts: [APIRequestContext, string, string][] = [
      [intruder.admin.context, victim.organizationId, victim.clinicId],
      [intruder.admin.context, intruder.organizationId, victim.clinicId],
      [orgAdmin.context, victim.organizationId, other.clinicId],
      [victim.admin.context, victim.clinicId, victim.clinicId],
    ];
    for (const [context, organizationId, clinicId] of attempts) {
      const response = await put(
        context,
        organizationId,
        clinicId,
        victim.doctor.doctorProfileId,
        specialtyIds,
      );
      await expectRejectedWithoutChanges(
        response,
        404,
        CLINIC_NOT_FOUND,
        clinics,
        before,
      );
    }
  });
});

test.describe("PUT doctors/:doctorProfileId/specialties: validación", () => {
  test("CA-43: la especialidad de otra organización, de otra cuenta o inexistente da 404 «Especialidad no encontrada»", async () => {
    const world = await createWorld("by-ca43");
    const stranger = await createWorld("by-ca43-stranger");
    const other = await createOtherOrganization(world);
    const [alfa] = world.specialties;
    const clinics = [world.clinicId];
    const before = await snapshot(clinics);

    for (const foreignId of [
      other.specialty.id,
      stranger.specialties[0].id,
      randomUUID(),
    ]) {
      for (const ids of [[foreignId], [alfa.id, foreignId]]) {
        const response = await put(
          world.admin.context,
          world.organizationId,
          world.clinicId,
          world.doctor.doctorProfileId,
          ids,
        );
        await expectRejectedWithoutChanges(
          response,
          404,
          SPECIALTY_NOT_FOUND,
          clinics,
          before,
        );
      }
    }
  });

  test("CA-43: claves de más, ids que no son uuid y 51 ids dan 400; 50 se aceptan; sin sesión 401", async () => {
    const world = await createWorld("by-ca43-400");
    const { admin, organizationId, clinicId } = world;
    const { doctorProfileId } = world.doctor;
    const [alfa] = world.specialties;
    const before = await snapshot([clinicId]);
    const url = putUrl(organizationId, clinicId, doctorProfileId);
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
      const response = await admin.context.put(url, { data });
      expect(response.status(), JSON.stringify(data).slice(0, 80)).toBe(400);
    }
    for (const [organization, clinic, profile] of [
      ["no-es-uuid", clinicId, doctorProfileId],
      [organizationId, "no-es-uuid", doctorProfileId],
      [organizationId, clinicId, "no-es-uuid"],
    ]) {
      const response = await put(admin.context, organization, clinic, profile, [
        alfa.id,
      ]);
      expect(response.status()).toBe(400);
    }
    expect(await snapshot([clinicId])).toEqual(before);

    const anonymous = await createApiContext();
    const unauthenticated = await put(
      anonymous,
      organizationId,
      clinicId,
      doctorProfileId,
      [alfa.id],
    );
    expect(unauthenticated.status()).toBe(401);
    expect(await snapshot([clinicId])).toEqual(before);

    const prisma = await getTestPrisma();
    const suffix = randomUUID().slice(0, 8);
    await prisma.specialty.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        name: `Masiva ${suffix} ${String(index).padStart(2, "0")}`,
        organizationId,
      })),
    });
    const created = await prisma.specialty.findMany({
      where: { name: { startsWith: `Masiva ${suffix}` } },
      select: { id: true },
    });
    const fifty = await put(
      admin.context,
      organizationId,
      clinicId,
      doctorProfileId,
      created.map((s: { id: string }) => s.id),
    );
    expect(fifty.status()).toBe(200);
    expect(
      ((await fifty.json()) as { specialties: unknown[] }).specialties,
    ).toHaveLength(50);
  });
});

test.describe("PUT doctors/:doctorProfileId/specialties: efectos", () => {
  test("CA-44: un DOCTOR con la invitación pendiente se puede editar", async () => {
    const world = await createWorld("by-ca44");
    const [alfa, , zeta] = world.specialties;
    const prisma = await getTestPrisma();
    await prisma.subscription.update({
      where: { accountId: world.admin.accountId },
      data: { plan: "CONSULTORIO", status: "ACTIVE" },
    });
    const invited = await invitePendingUser(world.admin, {
      resourceId: world.clinicId,
      role: "DOCTOR",
      specialtyIds: [alfa.id],
    });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({
      where: {
        userId_clinicId: { userId: invited.userId, clinicId: world.clinicId },
      },
    });

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      profile.id,
      [zeta.id],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [zeta] });
    expect(await specialtyIdsOf(profile.id)).toEqual([zeta.id]);
  });

  test("CA-45: con [] responde 200 y el médico y su especialidad salen del booking", async () => {
    const world = await createWorld("by-ca45");
    const { doctorProfileId } = world.doctor;
    const before = await listPublicDoctors(world.clinicId);
    expect(before.map((d) => d.doctorProfileId)).toContain(doctorProfileId);

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      doctorProfileId,
      [],
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ specialties: [] });
    const after = await listPublicDoctors(world.clinicId);
    expect(after.map((d) => d.doctorProfileId)).not.toContain(doctorProfileId);
    expect(after.flatMap((d) => d.specialties.map((s) => s.id))).not.toContain(
      world.specialtyId,
    );
  });

  test("CA-46: la cita futura del médico vaciado no cambia y el paciente aún puede reprogramarla y cancelar otra", async () => {
    const world = await createWorld("by-ca46");
    const prisma = await getTestPrisma();
    await prisma.subscription.update({
      where: { accountId: world.admin.accountId },
      data: { plan: "CONSULTORIO", status: "ACTIVE" },
    });
    const toReschedule = await createManagedAppointment(world);
    const toCancel = await createManagedAppointment(world, {
      scheduledAt: limaWallTimeInDays(12, "10:00"),
    });
    const before = await readAppointment(toReschedule.appointmentId);

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      world.doctor.doctorProfileId,
      [],
    );

    expect(response.status()).toBe(200);
    const after = await readAppointment(toReschedule.appointmentId);
    expect(after).toEqual(before);
    expect(limaWallTime(after.scheduledAt)).toBe(toReschedule.scheduledAt);
    const client = await createPortalClient();
    const newWallTime = limaWallTimeInDays(11, "11:30");
    const rescheduled = await client.reschedule(toReschedule.token, {
      scheduledAt: newWallTime,
      expectedScheduledAt: toReschedule.scheduledAt,
    });
    expect(rescheduled.status()).toBe(200);
    expect(
      (await readAppointment(toReschedule.appointmentId)).doctorProfileId,
    ).toBe(world.doctor.doctorProfileId);
    const cancelled = await client.cancel(toCancel.token);
    expect(cancelled.status()).toBe(200);
    expect((await readAppointment(toCancel.appointmentId)).status).toBe(
      "CANCELLED",
    );
  });

  test("CA-47: en Gratis, con la plaza de médico ocupada, editar responde 200 y no crea ninguna membership", async () => {
    const world = await createWorld("by-ca47");
    const prisma = await getTestPrisma();
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { accountId: world.admin.accountId },
    });
    expect(subscription.plan).toBe("FREE");
    const before = await snapshot([world.clinicId, world.organizationId]);
    const accountMemberships = () =>
      prisma.userResourceMembership.count({
        where: { accountId: world.admin.accountId },
      });
    const membershipsBefore = await accountMemberships();

    const response = await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      world.doctor.doctorProfileId,
      [world.specialties[0].id],
    );

    expect(response.status()).toBe(200);
    expect(await accountMemberships()).toBe(membershipsBefore);
    const after = await snapshot([world.clinicId, world.organizationId]);
    expect(after.memberships).toEqual(before.memberships);
  });
});

test.describe("GET /clinic/:resourceId/users", () => {
  async function createUsersWorld(label: string) {
    const world = await createWorld(label);
    const other = await createOtherOrganization(world);
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.update({
      where: { id: world.doctor.doctorProfileId },
      data: { specialties: { connect: [{ id: other.specialty.id }] } },
    });
    const doctorWithoutProfile = await createMemberOf(
      world,
      world.clinicId,
      "DOCTOR",
    );
    const user = await createMemberOf(world, world.clinicId, "USER");
    const clinicAdmin = await createMemberOf(world, world.clinicId, "ADMIN");
    await createProfile(clinicAdmin.userId, world.clinicId, [
      world.specialtyId,
    ]);
    return { world, other, doctorWithoutProfile, user, clinicAdmin };
  }

  test("CA-48: cada fila trae doctorProfileId y specialties; las que no son DOCTOR, null y []", async () => {
    const { world, doctorWithoutProfile, user, clinicAdmin, other } =
      await createUsersWorld("by-ca48");

    const rows = await listClinicUsers(world.admin.context, world.clinicId);

    const rowOf = (email: string) => rows.find((r) => r.email === email);
    const doctorEmail = (
      await (
        await getTestPrisma()
      ).user.findUniqueOrThrow({ where: { id: world.doctor.userId } })
    ).email;
    expect(rowOf(doctorEmail)).toMatchObject({
      role: "DOCTOR",
      doctorProfileId: world.doctor.doctorProfileId,
      specialties: [{ id: world.specialtyId, name: world.specialtyName }],
    });
    expect(JSON.stringify(rows)).not.toContain(other.specialty.id);
    expect(rowOf(doctorWithoutProfile.email)).toMatchObject({
      role: "DOCTOR",
      doctorProfileId: null,
      specialties: [],
    });
    for (const member of [user, clinicAdmin]) {
      expect(rowOf(member.email)).toMatchObject({
        doctorProfileId: null,
        specialties: [],
      });
    }
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "doctorProfileId",
        "email",
        "lastName",
        "name",
        "phone",
        "role",
        "specialties",
      ]);
    }
  });

  test("CA-48: las especialidades de cada fila salen ordenadas por nombre", async () => {
    const { world } = await createUsersWorld("by-ca48-order");
    const [alfa, , zeta] = world.specialties;
    await put(
      world.admin.context,
      world.organizationId,
      world.clinicId,
      world.doctor.doctorProfileId,
      [zeta.id, alfa.id],
    );

    const rows = await listClinicUsers(world.admin.context, world.clinicId);

    expect(
      rows.find((r) => r.doctorProfileId === world.doctor.doctorProfileId)
        ?.specialties,
    ).toEqual([alfa, zeta]);
  });

  test("CA-49: después de guardar, la lista mantiene el mismo orden de filas", async () => {
    const { world } = await createUsersWorld("by-ca49");
    const emails = (rows: UserRow[]) => rows.map((r) => r.email);
    const before = emails(
      await listClinicUsers(world.admin.context, world.clinicId),
    );
    expect(before).toHaveLength(4);

    for (const ids of [[world.specialties[0].id], []]) {
      const response = await put(
        world.admin.context,
        world.organizationId,
        world.clinicId,
        world.doctor.doctorProfileId,
        ids,
      );
      expect(response.status()).toBe(200);
      expect(
        emails(await listClinicUsers(world.admin.context, world.clinicId)),
      ).toEqual(before);
    }
  });

  test("CA-50: DOCTOR y USER de la sede reciben 403; el intruso, 404", async () => {
    const { world, user } = await createUsersWorld("by-ca50");
    const doctorContext = await createApiContext();
    const prisma = await getTestPrisma();
    const doctorUser = await prisma.user.findUniqueOrThrow({
      where: { id: world.doctor.userId },
    });
    await signIn(doctorContext, doctorUser.email);
    const intruder = await createWorld("by-ca50-intruder");
    const url = `${API_BASE_URL}/clinic/${world.clinicId}/users`;

    expect((await doctorContext.get(url)).status()).toBe(403);
    expect((await user.context.get(url)).status()).toBe(403);
    expect((await intruder.admin.context.get(url)).status()).toBe(404);
  });
});
