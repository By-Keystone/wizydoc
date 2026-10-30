import { getTestPrisma } from "../../support/db";
import { softDeleteMembership } from "../../support/invitations";
import {
  addScopeMember,
  clinicPatientsPath,
  createPatientScopeWorld,
  organizationPatientsPath,
  selectOrganizationWorkspace,
} from "../../support/patient-scope";
import {
  clinicRecordPath,
  editRecordButton,
  expectNoPatientData,
  openClinicPatients,
  openOrganizationPatients,
  openPatientRecord,
  openRecordTab,
  organizationRecordPath,
  saveRecordButton,
  shownNames,
  toastItems,
  RECORD_SAVED,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-37, CA-38, CA-43 y CA-44 en el panel.

const SELECT_HEADING = "Elige dónde entrar";
const ERROR_HEADING = "Algo salió mal";
const NEW_PHONE = "+51922333444";

const namesOf = (...patients: { fullName: string }[]) =>
  patients.map((patient) => patient.fullName);

test.describe("Acceso a los pacientes en el panel", () => {
  test("CA-37: el USER de O1, sin membership en ninguna sede, abre la lista de B y la de O1", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-hereda");
    const { accountId } = world.admin;
    const userOfOne = await addScopeMember(
      world,
      "USER",
      world.organizationOne.id,
      "org-uno",
    );

    await openClinicPatients(page, userOfOne, accountId, world.clinicB.id);
    expect(await shownNames(page)).toEqual(namesOf(world.px, world.pb));

    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await page.goto(
      organizationPatientsPath(accountId, world.organizationOne.id),
    );
    await expect(
      page.getByRole("heading", { name: "Pacientes", level: 1 }),
    ).toBeVisible();
    expect(await shownNames(page)).toEqual(
      namesOf(world.px, world.pb, world.pa),
    );
  });

  for (const role of ["DOCTOR", "USER"] as const) {
    test(`CA-38: el ${role} de la sede A, al escribir a mano la sede B o la organización O1, llega a «Elige dónde entrar» sin ningún dato`, async ({
      page,
    }) => {
      const world = await createPatientScopeWorld(
        `ui-hermanas-${role.toLowerCase()}`,
      );
      const { accountId } = world.admin;
      const member = await addScopeMember(
        world,
        role,
        world.clinicA.id,
        "sede-a",
      );
      await openClinicPatients(page, member, accountId, world.clinicA.id);

      await page.goto(clinicPatientsPath(accountId, world.clinicB.id));
      await expect(
        page.getByRole("heading", { name: SELECT_HEADING }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/select\?switch=1$/);

      await page.goto(
        organizationPatientsPath(accountId, world.organizationOne.id),
      );

      await expect(
        page.getByRole("heading", { name: SELECT_HEADING }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/select\?switch=1$/);
      for (const hidden of [world.pa, world.pb, world.px]) {
        await expectNoPatientData(page, hidden);
      }
    });
  }

  test("CA-43: el DOCTOR de A que abre a mano la ficha de PB, y el ADMIN de O1 la de PC, ven la pantalla de error sin datos del paciente", async ({
    page,
    browser,
  }) => {
    const world = await createPatientScopeWorld("ui-fuera");
    const { accountId } = world.admin;
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

    await openClinicPatients(page, doctorOfA, accountId, world.clinicA.id);
    await page.goto(clinicRecordPath(accountId, world.clinicA.id, world.pb.id));
    await expect(
      page.getByRole("heading", { name: ERROR_HEADING }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reintentar" }),
    ).toBeVisible();
    await expectNoPatientData(page, world.pb);

    const adminPage = await (await browser.newContext()).newPage();
    await openOrganizationPatients(
      adminPage,
      adminOfOne,
      accountId,
      world.organizationOne.id,
    );
    await adminPage.goto(
      organizationRecordPath(accountId, world.organizationOne.id, world.pc.id),
    );
    await expect(
      adminPage.getByRole("heading", { name: ERROR_HEADING }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "Reintentar" }),
    ).toBeVisible();
    await expectNoPatientData(adminPage, world.pc);
    await adminPage.context().close();
  });

  test("CA-44: con la membership borrada y la ficha abierta, guardar muestra un toast de error y la base no cambia", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-borrada");
    const { accountId } = world.admin;
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    await openPatientRecord(
      page,
      doctorOfA,
      clinicRecordPath(accountId, world.clinicA.id, world.pa.id),
      world.pa.fullName,
    );
    await openRecordTab(page);
    await editRecordButton(page).click();
    await page.getByLabel("Teléfono").fill(NEW_PHONE);

    await softDeleteMembership(doctorOfA.membershipId);
    await saveRecordButton(page).click();

    await expect(toastItems(page)).toHaveCount(1);
    await expect(page.getByText(RECORD_SAVED)).toHaveCount(0);
    const prisma = await getTestPrisma();
    const stored = await prisma.patient.findFirst({
      where: { id: world.pa.id },
    });
    expect(stored?.phone).toBe(world.pa.phone);
  });
});
