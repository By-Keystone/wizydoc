import type { Browser, Page } from "@playwright/test";
import {
  addScopeMember,
  createPatientScopeWorld,
  formatLimaShortDate,
  type PatientScopeWorld,
} from "../../support/patient-scope";
import {
  clinicRecordPath,
  openClinicPatients,
  openOrganizationPatients,
  openPatientRecord,
  organizationRecordPath,
  patientRows,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-47 a CA-50.

const NO_DATE = "—";
const WITH_UPCOMING = "Con cita próxima";
const WITHOUT_UPCOMING = "Sin cita próxima";

async function expectStat(page: Page, label: string, value: string | number) {
  const stat = page.getByText(label, { exact: true }).locator("..");
  await expect(stat).toHaveText(`${value}${label}`);
}

const historyTable = (page: Page) =>
  page.getByRole("tabpanel").first().getByRole("table");

async function expectHistoryHasOnly(
  page: Page,
  shown: string[],
  hidden: string[],
) {
  const table = historyTable(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  for (const name of shown) {
    await expect(
      table.getByRole("cell", { name, exact: true }),
    ).not.toHaveCount(0);
  }
  for (const name of hidden) {
    await expect(table.getByRole("cell", { name, exact: true })).toHaveCount(0);
  }
}

async function expectAAndBMetrics(page: Page, world: PatientScopeWorld) {
  const { visits } = world.px;
  await expectStat(page, "Citas totales", 2);
  await expectStat(page, "Atendidas", 2);
  await expectStat(page, "Inasistencias", 0);
  await expectStat(
    page,
    "Primera visita",
    formatLimaShortDate(visits.visitAtClinicA),
  );
  await expectStat(
    page,
    "Última visita",
    formatLimaShortDate(visits.visitAtClinicB),
  );
  await expectStat(page, "Próxima cita", NO_DATE);
}

async function inFreshPage<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
) {
  const context = await browser.newContext();
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe("Historial y métricas de la ficha por organización", () => {
  test("CA-47: el DOCTOR de A ve de PX las citas de A y de B, cada una con su sede, y ninguna de C", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-historia-a", {
      distinctDoctors: true,
    });
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );

    await openPatientRecord(
      page,
      doctorOfA,
      clinicRecordPath(world.admin.accountId, world.clinicA.id, world.px.id),
      world.px.fullName,
    );

    await expectHistoryHasOnly(
      page,
      [world.clinicA.name, world.clinicB.name],
      [world.clinicC.name, world.doctorNames.clinicC],
    );
    await expectAAndBMetrics(page, world);
  });

  test("CA-48: el DOCTOR de C ve de PX sólo las dos citas de C, sin el nombre de A, de B ni de sus médicos", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-historia-c", {
      distinctDoctors: true,
    });
    const doctorOfC = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicC.id,
      "sede-c",
    );

    await openPatientRecord(
      page,
      doctorOfC,
      clinicRecordPath(world.admin.accountId, world.clinicC.id, world.px.id),
      world.px.fullName,
    );

    const table = historyTable(page);
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(
      table.getByRole("cell", { name: world.clinicC.name, exact: true }),
    ).toHaveCount(2);
    const html = await page.content();
    for (const hidden of [
      world.clinicA.name,
      world.clinicB.name,
      world.doctorNames.clinicA,
      world.doctorNames.clinicB,
    ]) {
      expect(html).not.toContain(hidden);
    }
    await expectStat(page, "Citas totales", 2);
    await expectStat(page, "Atendidas", 0);
    await expectStat(page, "Inasistencia", 1);
    await expectStat(page, "Primera visita", NO_DATE);
    await expectStat(page, "Última visita", NO_DATE);
    await expectStat(
      page,
      "Próxima cita",
      formatLimaShortDate(world.px.visits.upcomingAtClinicC),
    );
  });

  test("CA-49: el ADMIN de O1 abre la ficha de PX desde O1 y ve lo mismo que el DOCTOR de A", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-historia-org", {
      distinctDoctors: true,
    });
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    await openOrganizationPatients(
      page,
      adminOfOne,
      world.admin.accountId,
      world.organizationOne.id,
    );

    await page.goto(
      organizationRecordPath(
        world.admin.accountId,
        world.organizationOne.id,
        world.px.id,
      ),
    );

    await expect(
      page.getByRole("heading", { name: world.px.fullName, level: 1 }),
    ).toBeVisible();
    await expectHistoryHasOnly(
      page,
      [world.clinicA.name, world.clinicB.name],
      [world.clinicC.name],
    );
    await expectAAndBMetrics(page, world);
  });

  test("CA-50: la fila de PX en la lista cuenta las mismas citas que la ficha, en la sede A, en O1 y en C", async ({
    page,
    browser,
  }) => {
    const world = await createPatientScopeWorld("ui-historia-fila");
    const { accountId } = world.admin;
    const lastVisitInAAndB = formatLimaShortDate(
      world.px.visits.visitAtClinicB,
    );
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

    const expectRow = async (
      listPage: Page,
      lastVisit: string,
      status: string,
    ) => {
      const row = patientRows(listPage).filter({ hasText: world.px.fullName });
      const cells = row.getByRole("cell");
      await expect(cells.nth(2)).toHaveText(lastVisit);
      await expect(cells.nth(3)).toHaveText("2");
      await expect(cells.nth(4)).toHaveText(status);
    };

    await openClinicPatients(page, doctorOfA, accountId, world.clinicA.id);
    await expectRow(page, lastVisitInAAndB, WITHOUT_UPCOMING);

    await inFreshPage(browser, async (organizationPage) => {
      await openOrganizationPatients(
        organizationPage,
        adminOfOne,
        accountId,
        world.organizationOne.id,
      );
      await expectRow(organizationPage, lastVisitInAAndB, WITHOUT_UPCOMING);
    });

    await inFreshPage(browser, async (clinicCPage) => {
      await openClinicPatients(
        clinicCPage,
        doctorOfC,
        accountId,
        world.clinicC.id,
      );
      await expectRow(clinicCPage, NO_DATE, WITH_UPCOMING);
    });
  });
});
