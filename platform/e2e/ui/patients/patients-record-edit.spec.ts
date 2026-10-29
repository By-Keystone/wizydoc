import type { Page } from "@playwright/test";
import { getTestPrisma } from "../../support/db";
import {
  addMixedRoleMember,
  addScopeMember,
  createPatientScopeWorld,
} from "../../support/patient-scope";
import {
  addAllergy,
  clinicRecordPath,
  editRecordButton,
  HEALTH_DATA_READ_ONLY_NOTE,
  openPatientRecord,
  openRecordTab,
  organizationRecordPath,
  RECORD_SAVED,
  saveRecordButton,
} from "../../support/patients-ui";
import { selectOrganizationWorkspace } from "../../support/patient-scope";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-31, CA-53 y CA-62.

const NEW_PHONE = "+51933444555";
const NEW_ALLERGY = "Penicilina";
const BLOOD_TYPE_FIELD = "Grupo sanguíneo";

async function storedPatient(patientId: string) {
  const prisma = await getTestPrisma();
  return prisma.patient.findFirst({ where: { id: patientId } });
}

async function expectHealthDataReadOnly(page: Page) {
  await openRecordTab(page);
  await expect(page.getByText(HEALTH_DATA_READ_ONLY_NOTE)).toBeVisible();
  await editRecordButton(page).click();
  await expect(page.getByLabel(BLOOD_TYPE_FIELD)).toHaveCount(0);
}

async function expectHealthDataEditable(page: Page) {
  await openRecordTab(page);
  await editRecordButton(page).click();
  await expect(page.getByLabel(BLOOD_TYPE_FIELD)).toBeEnabled();
  await expect(page.getByText(HEALTH_DATA_READ_ONLY_NOTE)).toHaveCount(0);
}

test.describe("Edición de la ficha según el rol", () => {
  test("CA-62: el DOCTOR de A edita la ficha de PA desde la sede y el cambio sigue al recargar", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-edita-sede");
    const doctorOfA = await addScopeMember(
      world,
      "DOCTOR",
      world.clinicA.id,
      "sede-a",
    );
    await openPatientRecord(
      page,
      doctorOfA,
      clinicRecordPath(world.admin.accountId, world.clinicA.id, world.pa.id),
      world.pa.fullName,
    );

    await openRecordTab(page);
    await editRecordButton(page).click();
    await addAllergy(page, NEW_ALLERGY);
    await page.getByLabel("Teléfono").fill(NEW_PHONE);
    await saveRecordButton(page).click();
    await expect(page.getByText(RECORD_SAVED)).toBeVisible();

    await page.reload();
    await expect(page.getByText(`Alergia: ${NEW_ALLERGY}`)).toBeVisible();
    await expect(page.getByText(NEW_PHONE)).toBeVisible();
    await openRecordTab(page);
    await expect(page.getByLabel("Teléfono")).toHaveValue(NEW_PHONE);
    const stored = await storedPatient(world.pa.id);
    expect(stored?.phone).toBe(NEW_PHONE);
    expect(stored?.allergies).toEqual([NEW_ALLERGY]);
  });

  test("CA-31: el ADMIN de O1 edita las alergias y el teléfono de PA desde la ficha de la organización y el cambio se ve desde la sede A", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-edita-org");
    const { accountId } = world.admin;
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await openPatientRecord(
      page,
      adminOfOne,
      organizationRecordPath(accountId, world.organizationOne.id, world.pa.id),
      world.pa.fullName,
    );

    await openRecordTab(page);
    await editRecordButton(page).click();
    await addAllergy(page, NEW_ALLERGY);
    await page.getByLabel("Teléfono").fill(NEW_PHONE);
    await saveRecordButton(page).click();
    await expect(page.getByText(RECORD_SAVED)).toBeVisible();

    await page.goto(clinicRecordPath(accountId, world.clinicA.id, world.pa.id));
    await expect(
      page.getByRole("heading", { name: world.pa.fullName, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(`Alergia: ${NEW_ALLERGY}`)).toBeVisible();
    await expect(page.getByText(NEW_PHONE)).toBeVisible();
    const stored = await storedPatient(world.pa.id);
    expect(stored?.phone).toBe(NEW_PHONE);
    expect(stored?.allergies).toEqual([NEW_ALLERGY]);
  });

  test("CA-53: el usuario con USER en A y ADMIN en B ve los datos de salud de PX en solo lectura desde A y los edita desde B", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-edita-mixto");
    const { accountId } = world.admin;
    const mixed = await addMixedRoleMember(world);
    await openPatientRecord(
      page,
      mixed,
      clinicRecordPath(accountId, world.clinicA.id, world.px.id),
      world.px.fullName,
    );

    await expectHealthDataReadOnly(page);
    await page.getByLabel("Teléfono").fill(NEW_PHONE);
    await saveRecordButton(page).click();
    await expect(page.getByText(RECORD_SAVED)).toBeVisible();
    expect((await storedPatient(world.px.id))?.phone).toBe(NEW_PHONE);

    await page.goto(clinicRecordPath(accountId, world.clinicB.id, world.px.id));
    await expect(
      page.getByRole("heading", { name: world.px.fullName, level: 1 }),
    ).toBeVisible();
    await expectHealthDataEditable(page);
    await addAllergy(page, NEW_ALLERGY);
    await saveRecordButton(page).click();
    await expect(page.getByText(RECORD_SAVED)).toBeVisible();
    expect((await storedPatient(world.px.id))?.allergies).toEqual([
      NEW_ALLERGY,
    ]);
  });

  test("CA-53: en la ficha de la organización el USER de O1 ve los datos de salud en solo lectura y sólo corrige el contacto", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-edita-org-user");
    const userOfOne = await addScopeMember(
      world,
      "USER",
      world.organizationOne.id,
      "org-uno",
    );
    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await openPatientRecord(
      page,
      userOfOne,
      organizationRecordPath(
        world.admin.accountId,
        world.organizationOne.id,
        world.pa.id,
      ),
      world.pa.fullName,
    );

    await expectHealthDataReadOnly(page);
    await page.getByLabel("Teléfono").fill(NEW_PHONE);
    await saveRecordButton(page).click();

    await expect(page.getByText(RECORD_SAVED)).toBeVisible();
    expect((await storedPatient(world.pa.id))?.phone).toBe(NEW_PHONE);
  });

  test("CA-53: en la ficha de la organización el DOCTOR de O1 edita los datos de salud", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-edita-org-doctor");
    const doctorOfOne = await addScopeMember(
      world,
      "DOCTOR",
      world.organizationOne.id,
      "org-uno",
    );
    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await openPatientRecord(
      page,
      doctorOfOne,
      organizationRecordPath(
        world.admin.accountId,
        world.organizationOne.id,
        world.pa.id,
      ),
      world.pa.fullName,
    );

    await expectHealthDataEditable(page);
    await addAllergy(page, NEW_ALLERGY);
    await saveRecordButton(page).click();

    await expect(page.getByText(RECORD_SAVED)).toBeVisible();
    expect((await storedPatient(world.pa.id))?.allergies).toEqual([
      NEW_ALLERGY,
    ]);
  });
});
