import {
  createPortalScenario,
  DEFAULT_APPOINTMENT_TIME,
  DEFAULT_DAYS_AHEAD,
  limaWallTimeInDays,
  newPortalPatient,
  postBooking,
} from "../../support/appointment-portal";
import { softDeleteMembership } from "../../support/invitations";
import { addScopeMember, restoreMembership } from "../../support/patient-scope";
import { createClinicWithPatients } from "../../support/patient-search-world";
import {
  NEUTRAL_PATIENT_PHONE,
  enablePatientRecords,
  numberedPatientSpecs,
  seedPatientsInOrder,
} from "../../support/patients";
import {
  LOAD_MORE_ERROR,
  SEE_MORE_PATIENTS,
  openClinicPatients,
  patientNameLinks,
  patientRows,
  phoneLinks,
  searchBox,
  searchStatus,
  shownNames,
  toastItems,
  trackServerActions,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-1 a CA-3, CA-5 a CA-7 y CA-60.

const LAST_NAME = "Larga";
const PAGE_SIZE = 20;
const LONG_LIST_SIZE = 45;
const FIRST_DOCUMENT_NUMBER = 60000000;

const nameOf = (position: number) =>
  `Paciente${String(position).padStart(2, "0")} ${LAST_NAME}`;

const newestFirst = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => nameOf(to - index));

function createLongList(label: string, size = LONG_LIST_SIZE) {
  return createClinicWithPatients(
    label,
    numberedPatientSpecs(size, LAST_NAME, FIRST_DOCUMENT_NUMBER),
  );
}

type LongList = Awaited<ReturnType<typeof createLongList>>;

const openList = (
  page: Parameters<typeof openClinicPatients>[0],
  world: LongList,
) =>
  openClinicPatients(page, world.admin, world.admin.accountId, world.clinic.id);

test.describe("Lista de pacientes y «Ver más»", () => {
  test("CA-1: la página trae el título, el subtítulo, el buscador y los 20 pacientes más nuevos con «Ver más pacientes»", async ({
    page,
  }) => {
    const world = await createLongList("lista-larga");
    await openList(page, world);

    await expect(
      page.getByText(
        "Pacientes con alguna cita en esta sede. Los nuevos aparecen primero.",
      ),
    ).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
    await expect(searchBox(page)).toHaveValue("");
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
    expect(await shownNames(page)).toEqual(
      newestFirst(LONG_LIST_SIZE - PAGE_SIZE + 1, LONG_LIST_SIZE),
    );
    await expect(
      page.getByRole("button", { name: SEE_MORE_PATIENTS }),
    ).toBeVisible();
  });

  test("CA-2: «Ver más pacientes» agrega 20 filas sin reordenar, luego 5, y el botón desaparece", async ({
    page,
  }) => {
    const world = await createLongList("ver-mas");
    await openList(page, world);
    const firstPage = await shownNames(page);
    const seeMore = page.getByRole("button", { name: SEE_MORE_PATIENTS });

    await seeMore.click();
    await expect(patientRows(page)).toHaveCount(2 * PAGE_SIZE);
    expect((await shownNames(page)).slice(0, PAGE_SIZE)).toEqual(firstPage);

    await seeMore.click();
    await expect(patientRows(page)).toHaveCount(LONG_LIST_SIZE);
    await expect(seeMore).toHaveCount(0);
    const everyone = await shownNames(page);
    expect(everyone).toEqual(newestFirst(1, LONG_LIST_SIZE));
    expect(new Set(everyone).size).toBe(LONG_LIST_SIZE);
  });

  for (const size of [PAGE_SIZE, 3]) {
    test(`CA-2: con ${size} pacientes no hay «Ver más pacientes»`, async ({
      page,
    }) => {
      const world = await createLongList(`sin-ver-mas-${size}`, size);
      await openList(page, world);

      await expect(patientRows(page)).toHaveCount(size);
      await expect(
        page.getByRole("button", { name: SEE_MORE_PATIENTS }),
      ).toHaveCount(0);
    });
  }

  test("CA-3: un doble clic en «Ver más pacientes» carga una sola página, sin filas repetidas", async ({
    page,
  }) => {
    const world = await createLongList("doble-clic");
    await openList(page, world);
    const actions = trackServerActions(page);

    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).dblclick();

    await expect(patientRows(page)).toHaveCount(2 * PAGE_SIZE);
    const names = await shownNames(page);
    expect(new Set(names).size).toBe(2 * PAGE_SIZE);
    expect(actions.count()).toBe(1);
  });

  test("CA-5: tras «Ver más» el foco queda en el primer paciente nuevo y la línea de estado dice «Se muestran 40 pacientes»", async ({
    page,
  }) => {
    const world = await createLongList("foco");
    await openList(page, world);

    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();

    await expect(patientRows(page)).toHaveCount(2 * PAGE_SIZE);
    const firstNewRow = nameOf(LONG_LIST_SIZE - PAGE_SIZE);
    await expect(page.getByRole("link", { name: firstNewRow })).toBeFocused();
    await expect(searchStatus(page)).toHaveText("Se muestran 40 pacientes");
  });

  test("CA-6: si «Ver más» falla sale el toast, las filas se quedan y el botón sigue habilitado", async ({
    page,
  }) => {
    const world = await createLongList("ver-mas-falla");
    const doctor = await addScopeMember(
      world,
      "DOCTOR",
      world.clinic.id,
      "ver-mas",
    );
    await openClinicPatients(
      page,
      doctor,
      world.admin.accountId,
      world.clinic.id,
    );
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);

    await softDeleteMembership(doctor.membershipId);
    const seeMore = page.getByRole("button", { name: SEE_MORE_PATIENTS });
    await seeMore.click();

    await expect(page.getByText(LOAD_MORE_ERROR)).toBeVisible();
    await expect(toastItems(page)).toHaveCount(1);
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
    await expect(seeMore).toBeEnabled();

    await restoreMembership(doctor.membershipId);
    await seeMore.click();
    await expect(patientRows(page)).toHaveCount(2 * PAGE_SIZE);
  });

  test("CA-7: un paciente que reserva con la página abierta no aparece en «Ver más» ni repite a nadie, y al recargar es la primera fila", async ({
    page,
  }) => {
    const scenario = await createPortalScenario("ver-mas-nuevo");
    await enablePatientRecords(scenario.admin.accountId);
    await seedPatientsInOrder({
      accountId: scenario.admin.accountId,
      clinicId: scenario.clinicId,
      doctorProfileId: scenario.doctor.doctorProfileId,
      specs: numberedPatientSpecs(25, LAST_NAME, FIRST_DOCUMENT_NUMBER),
    });
    await openClinicPatients(
      page,
      scenario.admin,
      scenario.admin.accountId,
      scenario.clinicId,
    );
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);

    const newcomer = newPortalPatient();
    const booking = await postBooking(
      scenario,
      scenario.doctor.doctorProfileId,
      limaWallTimeInDays(DEFAULT_DAYS_AHEAD, DEFAULT_APPOINTMENT_TIME),
      newcomer,
    );
    expect(booking.ok()).toBe(true);
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();

    await expect(patientRows(page)).toHaveCount(25);
    const names = await shownNames(page);
    expect(new Set(names).size).toBe(25);
    expect(names).not.toContain(`${newcomer.name} ${newcomer.lastName}`);

    await page.reload();
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
    await expect(patientNameLinks(page).first()).toHaveText(
      `${newcomer.name} ${newcomer.lastName}`,
    );
  });

  test("CA-60: el teléfono es un enlace tel: en la lista y en las filas que trae «Ver más»", async ({
    page,
  }) => {
    const world = await createLongList("telefono");
    await openList(page, world);
    await page.getByRole("button", { name: SEE_MORE_PATIENTS }).click();
    await expect(patientRows(page)).toHaveCount(2 * PAGE_SIZE);

    const hrefs = await phoneLinks(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    );
    expect(hrefs).toHaveLength(2 * PAGE_SIZE);
    expect(new Set(hrefs)).toEqual(new Set([`tel:${NEUTRAL_PATIENT_PHONE}`]));
  });
});
