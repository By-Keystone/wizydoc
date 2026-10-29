import {
  addScopeMember,
  createPatientScopeWorld,
  organizationPatientsPath,
  selectOrganizationWorkspace,
} from "../../support/patient-scope";
import { createClinicWithPatients } from "../../support/patient-search-world";
import {
  numberedPatientSpecs,
  seedPatientsInOrder,
} from "../../support/patients";
import {
  NO_RESULTS_TITLE,
  openClinicPatients,
  openOrganizationPatients,
  patientRows,
  SEE_MORE_PATIENTS,
  searchBox,
  searchFor,
  shownNames,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-29 a CA-32 y CA-61 en la vista de organización.

const ORGANIZATION_SUBTITLE =
  "Pacientes de todas las sedes. Los nuevos aparecen primero.";
const ORGANIZATION_EMPTY_SUBTITLE_HINT =
  "Aparecen aquí cuando reservan su primera cita en cualquiera de tus sedes.";
const PAGE_SIZE = 20;

const namesOf = (...patients: { fullName: string }[]) =>
  patients.map((patient) => patient.fullName);

test.describe("Pacientes en la vista de organización", () => {
  test("CA-29: el ADMIN de O1 ve a PA, PB y PX sin PC, y busca a PB pero no a PC", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-org-lista");
    const admin = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    await openOrganizationPatients(
      page,
      admin,
      world.admin.accountId,
      world.organizationOne.id,
    );

    await expect(page.getByText(ORGANIZATION_SUBTITLE)).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    expect(await shownNames(page)).toEqual(
      namesOf(world.px, world.pb, world.pa),
    );

    await searchFor(page, world.pb.lastName);
    await expect.poll(() => shownNames(page)).toEqual(namesOf(world.pb));

    await searchFor(page, world.pc.lastName);
    await expect(page.getByText(NO_RESULTS_TITLE)).toBeVisible();
    await expect(page.getByText(/Aquí solo aparecen/)).toHaveCount(0);
    await expect(patientRows(page)).toHaveCount(0);
  });

  test("CA-29: con más de 20 pacientes en sus sedes aparece «Ver más pacientes», como en la sede", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-org-largo");
    await seedPatientsInOrder({
      accountId: world.admin.accountId,
      clinicId: world.clinicB.id,
      doctorProfileId: world.doctorProfileIds.clinicB,
      specs: numberedPatientSpecs(20, "Extra", 64000000),
    });
    const admin = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    await openOrganizationPatients(
      page,
      admin,
      world.admin.accountId,
      world.organizationOne.id,
    );

    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
    const seeMore = page.getByRole("button", { name: SEE_MORE_PATIENTS });
    await seeMore.click();

    await expect(patientRows(page)).toHaveCount(23);
    await expect(seeMore).toHaveCount(0);
  });

  test("CA-30: el nombre enlaza a la ficha de la organización, con su título, y «Pacientes» vuelve a la lista de O1", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-org-ficha");
    const { accountId } = world.admin;
    const organizationId = world.organizationOne.id;
    const admin = await addScopeMember(
      world,
      "ADMIN",
      organizationId,
      "org-uno",
    );
    await openOrganizationPatients(page, admin, accountId, organizationId);
    const nameLink = page.getByRole("link", { name: world.pa.fullName });

    await expect(nameLink).toHaveAttribute(
      "href",
      `${organizationPatientsPath(accountId, organizationId)}/${world.pa.id}`,
    );
    await nameLink.click();

    await expect(
      page.getByRole("heading", { name: world.pa.fullName, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Historial de citas" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Ficha", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Ficha del paciente · WizyDoc");

    await page
      .getByRole("main")
      .getByRole("link", { name: "Pacientes", exact: true })
      .click();

    await expect(page).toHaveURL(
      organizationPatientsPath(accountId, organizationId),
    );
    await expect(page.getByText(ORGANIZATION_SUBTITLE)).toBeVisible();
  });

  test("CA-32: sin pacientes no hay buscador y el vacío dice de dónde salen, en la sede y en la organización", async ({
    page,
  }) => {
    const world = await createClinicWithPatients("ui-vacio", []);
    const { accountId } = world.admin;
    await openClinicPatients(page, world.admin, accountId, world.clinic.id);

    await expect(page.getByText("Todavía no hay pacientes.")).toBeVisible();
    await expect(
      page.getByText(
        `Aparecen aquí cuando reservan su primera cita en ${world.clinic.name}.`,
      ),
    ).toBeVisible();
    await expect(searchBox(page)).toHaveCount(0);

    await selectOrganizationWorkspace(page, world.organization.id);
    await page.goto(organizationPatientsPath(accountId, world.organization.id));

    await expect(page.getByText("Todavía no hay pacientes.")).toBeVisible();
    await expect(
      page.getByText(ORGANIZATION_EMPTY_SUBTITLE_HINT),
    ).toBeVisible();
    await expect(searchBox(page)).toHaveCount(0);
  });

  test("CA-61: «Pacientes · WizyDoc» en las dos listas y «Ficha del paciente · WizyDoc» en la ficha de la organización, sin el nombre ni el término", async ({
    page,
  }) => {
    const world = await createPatientScopeWorld("ui-titulos");
    const { accountId } = world.admin;
    const admin = await addScopeMember(
      world,
      "ADMIN",
      world.organizationOne.id,
      "org-uno",
    );
    await openClinicPatients(page, admin, accountId, world.clinicA.id);
    await expect(page).toHaveTitle("Pacientes · WizyDoc");
    await searchFor(page, world.pa.lastName);
    await expect.poll(() => shownNames(page)).toEqual(namesOf(world.pa));
    expect(await page.title()).not.toContain(world.pa.lastName);

    await page.getByRole("link", { name: world.pa.fullName }).click();
    await expect(
      page.getByRole("heading", { name: world.pa.fullName, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Ficha del paciente · WizyDoc");

    await selectOrganizationWorkspace(page, world.organizationOne.id);
    await page.goto(
      organizationPatientsPath(accountId, world.organizationOne.id),
    );
    await expect(page).toHaveTitle("Pacientes · WizyDoc");
    await searchFor(page, world.pb.lastName);
    await expect.poll(() => shownNames(page)).toEqual(namesOf(world.pb));
    expect(await page.title()).not.toContain(world.pb.lastName);

    await page.getByRole("link", { name: world.pb.fullName }).click();
    await expect(
      page.getByRole("heading", { name: world.pb.fullName, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Ficha del paciente · WizyDoc");
    expect(await page.title()).not.toContain(world.pb.name);
  });
});
