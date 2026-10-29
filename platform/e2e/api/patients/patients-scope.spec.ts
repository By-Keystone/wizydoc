import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { SeedMembershipRole } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import {
  addScopeMember,
  createForeignClinicWithPatient,
  createPatientScopeWorld,
  patientsApiUrl,
} from "../../support/patient-scope";
import { setAccountPlan } from "../../support/patients";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-25, CA-34, CA-36 a CA-42, CA-44 y CA-45.

const RESOURCE_NOT_FOUND = "Resource not found";
const PATIENT_NOT_FOUND = "Patient not found";
const NEW_PHONE = "+51911000111";
const UNKNOWN_UUID = "0192b3c4-d5e6-7f80-9a1b-2c3d4e5f6a7b";
const ROLES: SeedMembershipRole[] = ["ADMIN", "DOCTOR", "USER"];

interface ListedPatient {
  name: string;
  lastName: string;
}

async function listedNames(response: APIResponse): Promise<string[]> {
  expect(response.status()).toBe(200);
  const { data } = (await response.json()) as { data: ListedPatient[] };
  return data.map((patient) => `${patient.name} ${patient.lastName}`);
}

async function expectNotFound(response: APIResponse, message: string) {
  expect(response.status()).toBe(404);
  expect(await response.json()).toMatchObject({ message });
}

const fullNames = (...patients: { fullName: string }[]) =>
  patients.map((patient) => patient.fullName);

function patientRoutes(context: APIRequestContext, resourceId: string) {
  return {
    list: () => context.get(patientsApiUrl(resourceId)),
    search: (search = "Pa") =>
      context.post(patientsApiUrl(resourceId, "/search"), { data: { search } }),
    detail: (patientId: string) =>
      context.get(patientsApiUrl(resourceId, `/${patientId}`)),
    update: (patientId: string, data: Record<string, unknown>) =>
      context.patch(patientsApiUrl(resourceId, `/${patientId}`), { data }),
  };
}

async function storedPhone(patientId: string) {
  const prisma = await getTestPrisma();
  return (await prisma.patient.findFirst({ where: { id: patientId } }))?.phone;
}

test.describe("Alcance de los pacientes en el api", () => {
  test("CA-36: ADMIN, DOCTOR y USER de la sede A ven a PA y PX, nunca a PB ni a PC, y buscar no los trae", async () => {
    const world = await createPatientScopeWorld("scope-sede");

    for (const role of ROLES) {
      const member = await addScopeMember(
        world,
        role,
        world.clinicA.id,
        "sede-a",
      );
      const routes = patientRoutes(member.context, world.clinicA.id);

      expect(await listedNames(await routes.list())).toEqual(
        fullNames(world.px, world.pa),
      );
      for (const hidden of [world.pb, world.pc]) {
        expect(await listedNames(await routes.search(hidden.lastName))).toEqual(
          [],
        );
      }
      expect(await listedNames(await routes.search(world.pa.lastName))).toEqual(
        fullNames(world.pa),
      );
    }
  });

  test("CA-37: cualquier rol de la organización O1 hereda sus sedes y ve O1, y O2 y la sede C dan 404", async () => {
    const world = await createPatientScopeWorld("scope-hereda");

    for (const role of ROLES) {
      const member = await addScopeMember(
        world,
        role,
        world.organizationOne.id,
        "org-uno",
      );
      const inClinicA = patientRoutes(member.context, world.clinicA.id);
      const inClinicB = patientRoutes(member.context, world.clinicB.id);
      const inOrganization = patientRoutes(
        member.context,
        world.organizationOne.id,
      );

      expect(await listedNames(await inClinicA.list())).toEqual(
        fullNames(world.px, world.pa),
      );
      expect(await listedNames(await inClinicB.list())).toEqual(
        fullNames(world.px, world.pb),
      );
      expect(await listedNames(await inOrganization.list())).toEqual(
        fullNames(world.px, world.pb, world.pa),
      );
      for (const unreachable of [world.clinicC.id, world.organizationTwo.id]) {
        const routes = patientRoutes(member.context, unreachable);
        await expectNotFound(await routes.list(), RESOURCE_NOT_FOUND);
        await expectNotFound(await routes.search(), RESOURCE_NOT_FOUND);
      }
    }
  });

  test("CA-38: ser miembro de la sede A no da acceso a la sede B ni a la organización O1", async () => {
    const world = await createPatientScopeWorld("scope-hermanas");

    for (const role of ["DOCTOR", "USER"] as const) {
      const member = await addScopeMember(
        world,
        role,
        world.clinicA.id,
        "solo-a",
      );
      for (const unreachable of [world.clinicB.id, world.organizationOne.id]) {
        const routes = patientRoutes(member.context, unreachable);
        await expectNotFound(await routes.list(), RESOURCE_NOT_FOUND);
        await expectNotFound(await routes.search(), RESOURCE_NOT_FOUND);
        await expectNotFound(
          await routes.detail(world.pa.id),
          RESOURCE_NOT_FOUND,
        );
        await expectNotFound(
          await routes.update(world.pa.id, { phone: NEW_PHONE }),
          RESOURCE_NOT_FOUND,
        );
      }
    }
    expect(await storedPhone(world.pa.id)).toBe(world.pa.phone);
  });

  test("CA-39: nada de otra organización de la misma cuenta", async () => {
    const world = await createPatientScopeWorld("scope-otra-org");
    const doctorOfC = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicC.id,
      "sede-c",
    );
    const memberOfTwo = await addScopeMember(
      world,
      "USER",
      world.organizationTwo.id,
      "org-dos",
    );
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );

    const inClinicC = patientRoutes(doctorOfC.context, world.clinicC.id);
    expect(await listedNames(await inClinicC.list())).toEqual(
      fullNames(world.px, world.pc),
    );
    for (const unreachable of [
      world.clinicA.id,
      world.clinicB.id,
      world.organizationOne.id,
    ]) {
      await expectNotFound(
        await patientRoutes(doctorOfC.context, unreachable).list(),
        RESOURCE_NOT_FOUND,
      );
    }

    const inOrganizationOne = patientRoutes(
      adminOfOne.context,
      world.organizationOne.id,
    );
    const inOrganizationTwo = patientRoutes(
      memberOfTwo.context,
      world.organizationTwo.id,
    );
    expect(await listedNames(await inOrganizationOne.list())).not.toContain(
      world.pc.fullName,
    );
    expect(await listedNames(await inOrganizationTwo.list())).toEqual(
      fullNames(world.px, world.pc),
    );
    expect(
      await listedNames(await inClinicC.search(world.pa.lastName)),
    ).toEqual([]);
    expect(
      await listedNames(await inOrganizationTwo.search(world.pa.lastName)),
    ).toEqual([]);
    expect(
      await listedNames(await inOrganizationTwo.search(world.pb.lastName)),
    ).toEqual([]);
  });

  test("CA-41: lo que no se ve responde el mismo 404 en las cuatro rutas, y un id que no es uuid da 400", async () => {
    const world = await createPatientScopeWorld("scope-igual");
    const foreign = await createForeignClinicWithPatient({
      name: "Fernanda",
      lastName: "Ajena",
      documentNumber: "80000001",
    });
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    const unseenResources = [
      foreign.clinic.id,
      foreign.organization.id,
      UNKNOWN_UUID,
      world.clinicB.id,
    ];

    const bodies: unknown[] = [];
    for (const resourceId of unseenResources) {
      const routes = patientRoutes(doctorOfA.context, resourceId);
      for (const response of [
        await routes.list(),
        await routes.search(),
        await routes.detail(world.pa.id),
        await routes.update(world.pa.id, { phone: NEW_PHONE }),
      ]) {
        expect(response.status()).toBe(404);
        bodies.push(await response.json());
      }
    }
    expect(bodies).toHaveLength(unseenResources.length * 4);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({ message: RESOURCE_NOT_FOUND });

    const notAUuid = patientRoutes(doctorOfA.context, "no-es-uuid");
    for (const response of [
      await notAUuid.list(),
      await notAUuid.search(),
      await notAUuid.detail(world.pa.id),
      await notAUuid.update(world.pa.id, { phone: NEW_PHONE }),
    ]) {
      expect(response.status()).toBe(400);
    }
    const inClinicA = patientRoutes(doctorOfA.context, world.clinicA.id);
    expect((await inClinicA.detail("no-es-uuid")).status()).toBe(400);
    expect(await storedPhone(world.pa.id)).toBe(world.pa.phone);
  });

  test("CA-42: la ficha y la edición sólo abren pacientes del alcance, con GET y con PATCH", async () => {
    const world = await createPatientScopeWorld("scope-ficha");
    const foreign = await createForeignClinicWithPatient({
      name: "Fernanda",
      lastName: "Ajena",
      documentNumber: "80000002",
    });
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    const userOfOne = await addScopeMember(
      world,
      "USER",
      world.organizationOne.id,
      "org-uno",
    );
    const inClinicA = patientRoutes(doctorOfA.context, world.clinicA.id);
    const inClinicB = patientRoutes(doctorOfA.context, world.clinicB.id);
    const inOrganization = patientRoutes(
      userOfOne.context,
      world.organizationOne.id,
    );

    expect((await inClinicA.detail(world.pa.id)).status()).toBe(200);
    expect(
      (await inClinicA.update(world.pa.id, { phone: NEW_PHONE })).status(),
    ).toBe(204);
    expect(await storedPhone(world.pa.id)).toBe(NEW_PHONE);

    for (const hiddenId of [world.pb.id, foreign.patient.id, UNKNOWN_UUID]) {
      await expectNotFound(await inClinicA.detail(hiddenId), PATIENT_NOT_FOUND);
      await expectNotFound(
        await inClinicA.update(hiddenId, { phone: NEW_PHONE }),
        PATIENT_NOT_FOUND,
      );
    }
    await expectNotFound(
      await inClinicB.detail(world.pb.id),
      RESOURCE_NOT_FOUND,
    );
    await expectNotFound(
      await inClinicB.update(world.pb.id, { phone: NEW_PHONE }),
      RESOURCE_NOT_FOUND,
    );

    expect((await inOrganization.detail(world.pb.id)).status()).toBe(200);
    await expectNotFound(
      await inOrganization.detail(world.pc.id),
      PATIENT_NOT_FOUND,
    );
    await expectNotFound(
      await inOrganization.update(world.pc.id, { phone: NEW_PHONE }),
      PATIENT_NOT_FOUND,
    );

    expect(await storedPhone(world.pb.id)).toBe(world.pb.phone);
    expect(await storedPhone(world.pc.id)).toBe(world.pc.phone);
    expect(await storedPhone(foreign.patient.id)).toBe(foreign.patient.phone);
  });

  test("CA-44: con la membership borrada las cuatro rutas responden 404 «Resource not found»", async () => {
    const world = await createPatientScopeWorld("scope-borrada");
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    const routes = patientRoutes(adminOfOne.context, world.clinicA.id);
    expect((await routes.list()).status()).toBe(200);

    await softDeleteMembership(adminOfOne.membershipId);

    await expectNotFound(await routes.list(), RESOURCE_NOT_FOUND);
    await expectNotFound(await routes.search(), RESOURCE_NOT_FOUND);
    await expectNotFound(await routes.detail(world.pa.id), RESOURCE_NOT_FOUND);
    await expectNotFound(
      await routes.update(world.pa.id, { phone: NEW_PHONE }),
      RESOURCE_NOT_FOUND,
    );
    expect(await storedPhone(world.pa.id)).toBe(world.pa.phone);
  });

  test("CA-45: GET /patients, GET /patients/{id} y PATCH /patients/{id} ya no existen", async () => {
    const world = await createPatientScopeWorld("scope-rutas-viejas");
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    const { context } = doctorOfA;
    const legacyResponses = [
      await context.get(`${API_BASE_URL}/patients`),
      await context.get(`${API_BASE_URL}/patients/${world.pa.id}`),
      await context.patch(`${API_BASE_URL}/patients/${world.pa.id}`, {
        data: { phone: NEW_PHONE },
      }),
    ];

    for (const response of legacyResponses) {
      expect(response.ok()).toBe(false);
      const body = await response.text();
      expect(body).not.toContain(world.pa.name);
      expect(body).not.toContain(world.pa.documentNumber);
    }
    expect(await storedPhone(world.pa.id)).toBe(world.pa.phone);
  });

  test("CA-25: el api no busca por query: ?search= no filtra el listado", async () => {
    const world = await createPatientScopeWorld("scope-sin-query");
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );

    const response = await doctorOfA.context.get(
      `${patientsApiUrl(world.clinicA.id)}?search=${world.pa.lastName}`,
    );

    expect(await listedNames(response)).toEqual(fullNames(world.px, world.pa));
  });
});

test.describe("Plan Gratis en las rutas de pacientes", () => {
  test("CA-34: con acceso las cuatro rutas responden 402; sin acceso, 404 y nunca 402", async () => {
    const world = await createPatientScopeWorld("scope-gratis");
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    const removed = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "borrado",
    );
    const foreign = await createForeignClinicWithPatient({
      name: "Fernanda",
      lastName: "Ajena",
      documentNumber: "80000003",
    });
    await setAccountPlan(world.admin.accountId, "FREE");
    await softDeleteMembership(removed.membershipId);

    const withAccess = patientRoutes(doctorOfA.context, world.clinicA.id);
    for (const response of [
      await withAccess.list(),
      await withAccess.search(),
      await withAccess.detail(world.pa.id),
      await withAccess.update(world.pa.id, { phone: NEW_PHONE }),
    ]) {
      expect(response.status()).toBe(402);
    }
    expect(await storedPhone(world.pa.id)).toBe(world.pa.phone);

    for (const [context, resourceId] of [
      [doctorOfA.context, world.clinicB.id],
      [doctorOfA.context, world.organizationOne.id],
      [doctorOfA.context, foreign.clinic.id],
      [removed.context, world.clinicA.id],
    ] as const) {
      const withoutAccess = patientRoutes(context, resourceId);
      await expectNotFound(await withoutAccess.list(), RESOURCE_NOT_FOUND);
      await expectNotFound(await withoutAccess.search(), RESOURCE_NOT_FOUND);
      await expectNotFound(
        await withoutAccess.detail(world.pa.id),
        RESOURCE_NOT_FOUND,
      );
      await expectNotFound(
        await withoutAccess.update(world.pa.id, { phone: NEW_PHONE }),
        RESOURCE_NOT_FOUND,
      );
    }
  });
});
