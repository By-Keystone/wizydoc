import type { APIRequestContext } from "@playwright/test";
import {
  addScopeMember,
  createPatientScopeWorld,
  patientsApiUrl,
  type PatientScopeWorld,
} from "../../support/patient-scope";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-47 a CA-50 en el api.

interface PatientDetail {
  history: { clinicName: string; doctorName: string; scheduledAt: string }[];
  metrics: {
    totalAppointments: number;
    completedCount: number;
    noShowCount: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    nextAppointmentAt: string | null;
  };
}

interface ListedMetrics {
  id: string;
  totalAppointments: number;
  noShowCount: number;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
}

async function readDetail(
  context: APIRequestContext,
  resourceId: string,
  patientId: string,
): Promise<PatientDetail> {
  const response = await context.get(
    patientsApiUrl(resourceId, `/${patientId}`),
  );
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: PatientDetail }).data;
}

async function readListedRow(
  context: APIRequestContext,
  resourceId: string,
  patientId: string,
): Promise<ListedMetrics> {
  const response = await context.get(patientsApiUrl(resourceId));
  expect(response.status()).toBe(200);
  const { data } = (await response.json()) as { data: ListedMetrics[] };
  const row = data.find((listed) => listed.id === patientId);
  if (!row) throw new Error("El paciente no sale en la lista");
  return row;
}

const isoOf = (instant: Date) => instant.toISOString();

function expectMetricsOfAAndB(
  world: PatientScopeWorld,
  metrics: PatientDetail["metrics"],
) {
  const { visits } = world.px;
  expect(metrics).toEqual({
    totalAppointments: 2,
    completedCount: 2,
    noShowCount: 0,
    firstVisitAt: isoOf(visits.visitAtClinicA),
    lastVisitAt: isoOf(visits.visitAtClinicB),
    nextAppointmentAt: null,
  });
}

test.describe("Historial y métricas por organización en el api", () => {
  test("CA-47: el DOCTOR de A ve las citas de A y de B de PX, aunque no es miembro de B, y ninguna de C", async () => {
    const world = await createPatientScopeWorld("historia-a", {
      distinctDoctors: true,
    });
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );

    const detail = await readDetail(
      doctorOfA.context,
      world.clinicA.id,
      world.px.id,
    );

    expect(detail.history.map((entry) => entry.clinicName).sort()).toEqual(
      [world.clinicA.name, world.clinicB.name].sort(),
    );
    expect(detail.history.map((entry) => entry.doctorName).sort()).toEqual(
      [world.doctorNames.clinicA, world.doctorNames.clinicB].sort(),
    );
    expectMetricsOfAAndB(world, detail.metrics);
  });

  test("CA-48: el DOCTOR de C ve de PX solo las dos citas de C, sin A, B ni sus médicos", async () => {
    const world = await createPatientScopeWorld("historia-c", {
      distinctDoctors: true,
    });
    const doctorOfC = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicC.id,
      "sede-c",
    );

    const detail = await readDetail(
      doctorOfC.context,
      world.clinicC.id,
      world.px.id,
    );

    expect(detail.history.map((entry) => entry.clinicName)).toEqual([
      world.clinicC.name,
      world.clinicC.name,
    ]);
    expect(detail.history.map((entry) => entry.doctorName)).toEqual([
      world.doctorNames.clinicC,
      world.doctorNames.clinicC,
    ]);
    const serialized = JSON.stringify(detail);
    for (const hidden of [
      world.clinicA.name,
      world.clinicB.name,
      world.doctorNames.clinicA,
      world.doctorNames.clinicB,
    ]) {
      expect(serialized).not.toContain(hidden);
    }
    expect(detail.metrics).toEqual({
      totalAppointments: 2,
      completedCount: 0,
      noShowCount: 1,
      firstVisitAt: null,
      lastVisitAt: null,
      nextAppointmentAt: isoOf(world.px.visits.upcomingAtClinicC),
    });
  });

  test("CA-49: el ADMIN de O1 abre la ficha de PX desde O1 y ve lo mismo que el DOCTOR de A", async () => {
    const world = await createPatientScopeWorld("historia-org", {
      distinctDoctors: true,
    });
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );

    const detail = await readDetail(
      adminOfOne.context,
      world.organizationOne.id,
      world.px.id,
    );

    expect(detail.history.map((entry) => entry.clinicName).sort()).toEqual(
      [world.clinicA.name, world.clinicB.name].sort(),
    );
    expectMetricsOfAAndB(world, detail.metrics);
  });

  test("CA-50: la fila de PX en la lista cuenta las mismas citas que su ficha, en A, en O1 y en C", async () => {
    const world = await createPatientScopeWorld("historia-fila");
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
    const doctorOfC = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicC.id,
      "sede-c",
    );
    const { visits } = world.px;

    for (const [context, resourceId] of [
      [doctorOfA.context, world.clinicA.id],
      [adminOfOne.context, world.organizationOne.id],
    ] as const) {
      const row = await readListedRow(context, resourceId, world.px.id);
      expect(row).toMatchObject({
        totalAppointments: 2,
        noShowCount: 0,
        lastVisitAt: isoOf(visits.visitAtClinicB),
        nextAppointmentAt: null,
      });
      const detail = await readDetail(context, resourceId, world.px.id);
      expect(detail.metrics.totalAppointments).toBe(row.totalAppointments);
      expect(detail.metrics.lastVisitAt).toBe(row.lastVisitAt);
    }

    const rowInC = await readListedRow(
      doctorOfC.context,
      world.clinicC.id,
      world.px.id,
    );
    expect(rowInC).toMatchObject({
      totalAppointments: 2,
      noShowCount: 1,
      lastVisitAt: null,
      nextAppointmentAt: isoOf(visits.upcomingAtClinicC),
    });
  });
});
