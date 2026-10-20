import type { APIRequestContext } from "@playwright/test";
import {
  addPortalDoctor,
  createPortalScenario,
  type PortalScenario,
} from "../../support/appointment-portal";
import { seedFullDayAvailability } from "../../support/availability";
import { getTestPrisma } from "../../support/db";
import { API_BASE_URL } from "../../support/env";
import { softDeleteMembership } from "../../support/invitations";
import { expect, test } from "../../support/test";

// docs/features/doctor-profile-specialties/plan.md, PR 2: CA-11 y CA-12.

async function createClinicaScenario(label: string) {
  const scenario = await createPortalScenario(label);
  const prisma = await getTestPrisma();
  await prisma.subscription.update({
    where: { accountId: scenario.admin.accountId },
    data: { plan: "CLINICA", status: "ACTIVE" },
  });
  return scenario;
}

async function clinicDoctors(
  context: APIRequestContext,
  scenario: PortalScenario,
): Promise<number> {
  const response = await context.get(
    `${API_BASE_URL}/clinic/${scenario.clinicId}/metrics`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { doctors: number }).doctors;
}

async function organizationDoctors(
  context: APIRequestContext,
  scenario: PortalScenario,
): Promise<number> {
  const response = await context.get(
    `${API_BASE_URL}/organization/${scenario.organizationId}/metrics/doctor-count`,
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { doctorCount: number }).doctorCount;
}

async function bothCounts(
  context: APIRequestContext,
  scenario: PortalScenario,
) {
  return {
    clinic: await clinicDoctors(context, scenario),
    organization: await organizationDoctors(context, scenario),
  };
}

test("CA-11: el ADMIN con perfil y especialidades no cuenta sin horarios y sube en uno con un horario", async () => {
  const scenario = await createClinicaScenario("metrics-ca11");
  const { context } = scenario.admin;
  const baseline = await bothCounts(context, scenario);
  expect(baseline).toEqual({ clinic: 1, organization: 1 });

  const prisma = await getTestPrisma();
  await prisma.doctorProfile.create({
    data: {
      userId: scenario.admin.userId,
      clinicId: scenario.clinicId,
      specialties: { connect: [{ id: scenario.specialtyId }] },
    },
  });
  expect(await bothCounts(context, scenario)).toEqual(baseline);

  await seedFullDayAvailability(scenario.admin.userId, scenario.clinicId);
  expect(await bothCounts(context, scenario)).toEqual({
    clinic: baseline.clinic + 1,
    organization: baseline.organization + 1,
  });
});

test("CA-12: un DOCTOR invitado sin horarios cuenta, también si lo quitaron de la sede", async () => {
  const scenario = await createClinicaScenario("metrics-ca12");
  const { context } = scenario.admin;
  const baseline = await bothCounts(context, scenario);

  const unscheduled = await addPortalDoctor({
    label: "metrics-ca12-sin",
    clinicId: scenario.clinicId,
    admin: scenario.admin,
    specialtyId: scenario.specialtyId,
    availability: "none",
  });
  expect(await bothCounts(context, scenario)).toEqual({
    clinic: baseline.clinic + 1,
    organization: baseline.organization + 1,
  });

  await softDeleteMembership(unscheduled.membershipId);
  expect(await bothCounts(context, scenario)).toEqual({
    clinic: baseline.clinic + 1,
    organization: baseline.organization + 1,
  });
});
