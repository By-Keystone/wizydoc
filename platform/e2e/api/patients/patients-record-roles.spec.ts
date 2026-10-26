import type { APIResponse } from "@playwright/test";
import { getTestPrisma } from "../../support/db";
import {
  addMixedRoleMember,
  addScopeMember,
  createPatientScopeWorld,
  patientsApiUrl,
} from "../../support/patient-scope";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-51 y CA-52.

const HEALTH_DATA_FORBIDDEN =
  "Solo el personal sanitario puede editar los datos de salud";
const NEW_ALLERGIES = ["Penicilina"];
const NEW_PHONE = "+51911000222";

async function storedRecord(patientId: string) {
  const prisma = await getTestPrisma();
  return prisma.patient.findFirst({ where: { id: patientId } });
}

async function expectHealthDataForbidden(response: APIResponse) {
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({
    message: HEALTH_DATA_FORBIDDEN,
  });
}

test.describe("Quién edita los datos de salud en el api", () => {
  test("CA-51: ADMIN y DOCTOR editan las alergias; USER no, pero sí el teléfono", async () => {
    const world = await createPatientScopeWorld("roles-salud");
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    const doctorOfOne = await addScopeMember(
      world,
      "DOCTOR",
      world.organizationOne.id,
      "org-uno",
    );
    const userOfA = await addScopeMember(
      world,
      "USER",
      world.clinicA.id,
      "sede-a",
    );
    const userOfOne = await addScopeMember(
      world,
      "USER",
      world.organizationOne.id,
      "org-uno",
    );
    const patientUrl = patientsApiUrl(world.clinicA.id, `/${world.pa.id}`);

    for (const editor of [doctorOfA, adminOfOne, doctorOfOne]) {
      const response = await editor.context.patch(patientUrl, {
        data: { allergies: NEW_ALLERGIES },
      });
      expect(response.status()).toBe(204);
      expect((await storedRecord(world.pa.id))?.allergies).toEqual(
        NEW_ALLERGIES,
      );
      await editor.context.patch(patientUrl, { data: { allergies: [] } });
    }

    for (const reader of [userOfA, userOfOne]) {
      await expectHealthDataForbidden(
        await reader.context.patch(patientUrl, {
          data: { allergies: NEW_ALLERGIES },
        }),
      );
      expect((await storedRecord(world.pa.id))?.allergies).toEqual([]);
    }

    const contactOnly = await userOfA.context.patch(patientUrl, {
      data: { phone: NEW_PHONE },
    });
    expect(contactOnly.status()).toBe(204);
    expect((await storedRecord(world.pa.id))?.phone).toBe(NEW_PHONE);
  });

  test("CA-52: el rol que cuenta es el del recurso desde el que se abre la ficha", async () => {
    const world = await createPatientScopeWorld("roles-mixto");
    const mixed = await addMixedRoleMember(world);

    await expectHealthDataForbidden(
      await mixed.context.patch(
        patientsApiUrl(world.clinicA.id, `/${world.px.id}`),
        {
          data: { allergies: NEW_ALLERGIES },
        },
      ),
    );
    expect((await storedRecord(world.px.id))?.allergies).toEqual([]);

    const fromClinicB = await mixed.context.patch(
      patientsApiUrl(world.clinicB.id, `/${world.px.id}`),
      { data: { allergies: NEW_ALLERGIES } },
    );
    expect(fromClinicB.status()).toBe(204);
    expect((await storedRecord(world.px.id))?.allergies).toEqual(NEW_ALLERGIES);
  });
});
