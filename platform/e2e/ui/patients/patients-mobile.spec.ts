import type { Page } from "@playwright/test";
import { softDeleteMembership } from "../../support/invitations";
import {
  addScopeMember,
  createPatientScopeWorld,
  selectOrganizationWorkspace,
  organizationPatientsPath,
} from "../../support/patient-scope";
import { createClinicWithPatients } from "../../support/patient-search-world";
import {
  numberedPatientSpecs,
  seedPatientsInOrder,
} from "../../support/patients";
import {
  clearButton,
  expectNoHorizontalScroll,
  expectTableScrollsOnItsOwn,
  MINIMUM_MESSAGE,
  MOBILE,
  openClinicPatients,
  openOrganizationPatients,
  openPatientRecord,
  organizationRecordPath,
  patientRows,
  SEARCH_ERROR_TITLE,
  SEE_MORE_PATIENTS,
  searchBox,
  searchFor,
  searchStatus,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-54, CA-55 y CA-59.

// Una sola palabra larga: con espacios la columna del nombre se parte y la tabla cabe en 375 px.
const LONG_LAST_NAME = "Villanuevadelacruzquispehuaman";
const MIN_TAP_TARGET = 32;
const FIELD_HEIGHT = 40;
const MIN_FONT_SIZE_TO_AVOID_IOS_ZOOM = 16;

test.use({ viewport: MOBILE });

async function boxOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("El elemento no tiene caja visible");
  return box;
}

async function walkSearchStates(page: Page, searchTerm: string) {
  await expectNoHorizontalScroll(page);

  await searchBox(page).fill("q");
  await expect(searchStatus(page)).toHaveText(MINIMUM_MESSAGE);
  await expectNoHorizontalScroll(page);

  await searchFor(page, searchTerm);
  await expect(searchStatus(page)).toContainText("encontrado");
  await expectNoHorizontalScroll(page);

  await searchFor(page, "zzzz");
  await expect(searchStatus(page)).toHaveText("Ningún paciente encontrado");
  await expectNoHorizontalScroll(page);

  await clearButton(page).click();
  await expect(patientRows(page).first()).toBeVisible();
}

async function expectSearchErrorWithoutOverflow(
  page: Page,
  searchTerm: string,
) {
  await searchFor(page, searchTerm);
  await expect(page.getByText(SEARCH_ERROR_TITLE)).toBeVisible();
  await expectNoHorizontalScroll(page);
}

test.describe("Pacientes en el celular", () => {
  test("CA-54: la lista de la sede no se desplaza en horizontal en ningún estado", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-movil-sede",
      numberedPatientSpecs(45, "Larga", 67000000),
    );
    const doctor = await addScopeMember(
      world,
      "DOCTOR",
      world.clinic.id,
      "movil",
    );
    await openClinicPatients(
      page,
      doctor,
      world.admin.accountId,
      world.clinic.id,
    );

    await walkSearchStates(page, "Paciente0");
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();
    await expect(patientRows(page)).toHaveCount(40);
    await expectNoHorizontalScroll(page);

    await softDeleteMembership(doctor.membershipId);
    await expectSearchErrorWithoutOverflow(page, "Paciente1");
  });

  test("CA-54: la lista de la organización no se desplaza en horizontal en ningún estado", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-movil-org");
    await seedPatientsInOrder({
      accountId: world.admin.accountId,
      clinicId: world.clinicB.id,
      doctorProfileId: world.doctorProfileIds.clinicB,
      specs: numberedPatientSpecs(20, "Extra", 69000000),
    });
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "movil",
    );
    await openOrganizationPatients(
      page,
      adminOfOne,
      world.admin.accountId,
      world.organizationOne.id,
    );

    await walkSearchStates(page, world.pb.lastName);
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();
    await expect(patientRows(page)).toHaveCount(23);
    await expectNoHorizontalScroll(page);

    await softDeleteMembership(adminOfOne.membershipId);
    await expectSearchErrorWithoutOverflow(page, "Extra");
  });

  test("CA-54: sin pacientes, la lista de la sede y la de la organización no se desplazan en horizontal", async ({
    page,
  }) => {
    const world = await createClinicWithPatients("ui-movil-vacio", []);
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );
    await expect(page.getByText("Todavía no hay pacientes.")).toBeVisible();
    await expectNoHorizontalScroll(page);

    await selectOrganizationWorkspace(page, world.organization.id);
    await page.goto(
      organizationPatientsPath(world.admin.accountId, world.organization.id),
    );
    await expect(page.getByText("Todavía no hay pacientes.")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("CA-54: la ficha de la organización no se desplaza en horizontal", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-movil-ficha");
    const adminOfOne = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "movil",
    );
    await selectOrganizationWorkspace(page, world.organizationOne.id);

    await openPatientRecord(
      page,
      adminOfOne,
      organizationRecordPath(
        world.admin.accountId,
        world.organizationOne.id,
        world.px.id,
      ),
      world.px.fullName,
    );

    await expectNoHorizontalScroll(page);
  });

  test("CA-55: el buscador está arriba de la tabla, a lo ancho, de 40 px, con texto de 16 px o más, y «Ver más» ocupa todo el ancho", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-movil-medidas",
      numberedPatientSpecs(25, "Larga", 70000000),
    );
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );

    const field = searchBox(page);
    const fieldBox = await boxOf(field);
    const tableBox = await boxOf(page.getByRole("table"));
    const contentWidth = await page.getByRole("main").evaluate((main) => {
      const style = getComputedStyle(main);
      return (
        main.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      );
    });
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(tableBox.y);
    expect(fieldBox.x).toBeGreaterThanOrEqual(0);
    expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(MOBILE.width);
    expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(MOBILE.height);
    expect(fieldBox.width).toBeCloseTo(contentWidth, 0);
    expect(fieldBox.height).toBeCloseTo(FIELD_HEIGHT, 0);
    const fontSize = await field.evaluate((input) =>
      Number.parseFloat(getComputedStyle(input).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE_TO_AVOID_IOS_ZOOM);

    await field.fill("Paciente");
    const clearBox = await boxOf(clearButton(page));
    expect(clearBox.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    expect(clearBox.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

    await clearButton(page).click();
    const seeMoreBox = await boxOf(
      page.getByRole("button", { name: SEE_MORE_PATIENTS }),
    );
    expect(seeMoreBox.width).toBeCloseTo(contentWidth, 0);
    expect(seeMoreBox.height).toBeCloseTo(FIELD_HEIGHT, 0);
  });

  test("CA-59: a 375 px la tabla se desplaza sola y «Estado» es alcanzable, también con resultados de búsqueda y con 40 filas", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-movil-tabla",
      numberedPatientSpecs(45, LONG_LAST_NAME, 71000000),
    );
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );

    await expectTableScrollsOnItsOwn(page);

    await searchFor(page, "Paciente0");
    await expect(searchStatus(page)).toHaveText("9 pacientes encontrados");
    await expectTableScrollsOnItsOwn(page);

    await clearButton(page).click();
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();
    await expect(patientRows(page)).toHaveCount(40);
    await expectTableScrollsOnItsOwn(page);
  });
});
