import {
  clinicPatientsPath,
  createPatientScopeWorld,
  organizationPatientsPath,
  selectOrganizationWorkspace,
  type PatientScopeWorld,
} from "../../support/patient-scope";
import { createClinicWithPatients } from "../../support/patient-search-world";
import { numberedPatientSpecs, setAccountPlan } from "../../support/patients";
import {
  clinicRecordPath,
  openClinicPatients,
  organizationRecordPath,
  SEARCH_ERROR_TITLE,
  LOAD_MORE_ERROR,
  SEE_MORE_PATIENTS,
  searchBox,
  searchFor,
  toastItems,
} from "../../support/patients-ui";
import { loginAndGoTo } from "../../support/ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-33 y CA-35.

const PLAN_NOTICE = "Tu plan no permite hacer uso de esta función";
const PLAN_LINK = "Pedir el plan Consultorio";
const SUBTITLE = /Los nuevos aparecen primero/;

async function createFreeWorld(label: string): Promise<PatientScopeWorld> {
  const world = await createPatientScopeWorld(label);
  await setAccountPlan(world.admin.accountId, "FREE");
  return world;
}

test.describe("Plan Gratis en la lista y la ficha de pacientes", () => {
  test("CA-33: en Gratis la lista de la sede y la de la organización muestran sólo el título y el aviso del plan", async ({
    page,
  }) => {
    const world = await createFreeWorld("ui-gratis-listas");
    const { accountId } = world.admin;
    await loginAndGoTo(
      page,
      world.admin.email,
      clinicPatientsPath(accountId, world.clinicA.id),
    );

    const expectOnlyThePlanNotice = async () => {
      await expect(
        page.getByRole("heading", { name: "Pacientes", level: 1 }),
      ).toBeVisible();
      await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
      await expect(page.getByRole("link", { name: PLAN_LINK })).toBeVisible();
      await expect(page.getByText(SUBTITLE)).toHaveCount(0);
      await expect(searchBox(page)).toHaveCount(0);
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Ver más/ })).toHaveCount(
        0,
      );
    };
    await expectOnlyThePlanNotice();

    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await page.goto(
      organizationPatientsPath(accountId, world.organizationOne.id),
    );
    await expectOnlyThePlanNotice();
  });

  test("CA-33: en Gratis las dos fichas, la de la sede y la de la organización, muestran el aviso del plan", async ({
    page,
  }) => {
    const world = await createFreeWorld("ui-gratis-fichas");
    const { accountId } = world.admin;
    await loginAndGoTo(
      page,
      world.admin.email,
      clinicRecordPath(accountId, world.clinicA.id, world.pa.id),
    );
    await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
    await expect(page.getByRole("link", { name: PLAN_LINK })).toBeVisible();
    await expect(page.getByText(world.pa.fullName)).toHaveCount(0);

    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await page.goto(
      organizationRecordPath(accountId, world.organizationOne.id, world.pa.id),
    );
    await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
    await expect(page.getByRole("link", { name: PLAN_LINK })).toBeVisible();
    await expect(page.getByText(world.pa.fullName)).toHaveCount(0);
  });

  test("CA-35: si la cuenta baja a Gratis con la lista abierta, la siguiente búsqueda lleva al aviso del plan, no a «No pudimos buscar»", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-baja-busca",
      numberedPatientSpecs(25, "Larga", 65000000),
    );
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );

    await setAccountPlan(world.admin.accountId, "FREE");
    await searchFor(page, "Paciente05");

    await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
    await expect(page.getByText(SEARCH_ERROR_TITLE)).toHaveCount(0);
    await expect(toastItems(page)).toHaveCount(0);
    await expect(searchBox(page)).toHaveCount(0);
  });

  test("CA-35: si la cuenta baja a Gratis con la lista abierta, «Ver más» lleva al aviso del plan, no al toast", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-baja-ver-mas",
      numberedPatientSpecs(25, "Larga", 66000000),
    );
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );

    await setAccountPlan(world.admin.accountId, "FREE");
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();

    await expect(page.getByText(PLAN_NOTICE)).toBeVisible();
    await expect(page.getByText(LOAD_MORE_ERROR)).toHaveCount(0);
    await expect(toastItems(page)).toHaveCount(0);
  });
});
