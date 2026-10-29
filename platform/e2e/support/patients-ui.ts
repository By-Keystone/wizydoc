import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  clinicPatientsPath,
  organizationPatientsPath,
  selectOrganizationWorkspace,
} from "./patient-scope";
import { loginAndGoTo } from "./ui";

export const SEE_MORE_PATIENTS = "Ver más pacientes";
export const SEE_MORE_RESULTS = "Ver más resultados";
export const SEARCH_PLACEHOLDER = "Busca por nombre, DNI o teléfono";
export const MINIMUM_MESSAGE = "Escribe al menos 2 letras o números.";
export const NO_RESULTS_TITLE = "No encontramos pacientes que coincidan.";
export const LOAD_MORE_ERROR =
  "No pudimos cargar más pacientes. Vuelve a intentarlo.";
export const SEARCH_ERROR_TITLE = "No pudimos buscar";
export const SEARCH_DEBOUNCE_MILLISECONDS = 300;
export const MOBILE = { width: 375, height: 812 };

export const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "Buscar paciente" });

export const searchStatus = (page: Page) =>
  page.getByRole("search").getByRole("status");

export const clearButton = (page: Page) =>
  page.getByRole("search").getByRole("button", { name: "Limpiar búsqueda" });

// El otro botón «Limpiar búsqueda» (la «x» del campo) sólo tiene `aria-label`, sin texto.
export const emptyStateClearButton = (page: Page) =>
  page
    .getByRole("button", { name: "Limpiar búsqueda" })
    .filter({ hasText: "Limpiar búsqueda" });

export const toastItems = (page: Page) =>
  page.getByRole("region", { name: /Notifications/ }).getByRole("listitem");

export const patientRows = (page: Page) =>
  page.getByRole("row").filter({ has: page.getByRole("cell") });

// El enlace del nombre empieza por letra; el del teléfono, por «+».
export const patientNameLinks = (page: Page) =>
  patientRows(page).getByRole("link", { name: /^[A-Za-zÁ-ú]/ });

export const phoneLinks = (page: Page) =>
  patientRows(page).getByRole("link", { name: /^\+/ });

export async function shownNames(page: Page): Promise<string[]> {
  return (await patientNameLinks(page).allTextContents()).map((name) =>
    name.trim(),
  );
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function openClinicPatients(
  page: Page,
  user: { email: string },
  accountId: string,
  clinicId: string,
) {
  await loginAndGoTo(page, user.email, clinicPatientsPath(accountId, clinicId));
  await expect(
    page.getByRole("heading", { name: "Pacientes", level: 1 }),
  ).toBeVisible();
}

export async function openOrganizationPatients(
  page: Page,
  user: { email: string },
  accountId: string,
  organizationId: string,
) {
  await selectOrganizationWorkspace(page, organizationId);
  await loginAndGoTo(
    page,
    user.email,
    organizationPatientsPath(accountId, organizationId),
  );
  await expect(
    page.getByRole("heading", { name: "Pacientes", level: 1 }),
  ).toBeVisible();
}

// Vaciar el campo antes de cada término evita dar por buenos los resultados del término anterior.
export async function searchFor(page: Page, term: string) {
  await searchBox(page).fill("");
  await searchBox(page).fill(term);
}

export function trackServerActions(page: Page): { count: () => number } {
  let total = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      total += 1;
    }
  });
  return { count: () => total };
}

export const clinicRecordPath = (
  accountId: string,
  clinicId: string,
  patientId: string,
) => `${clinicPatientsPath(accountId, clinicId)}/${patientId}`;

export const organizationRecordPath = (
  accountId: string,
  organizationId: string,
  patientId: string,
) => `${organizationPatientsPath(accountId, organizationId)}/${patientId}`;

export async function openPatientRecord(
  page: Page,
  user: { email: string },
  recordPath: string,
  patientFullName: string,
) {
  await loginAndGoTo(page, user.email, recordPath);
  await expect(
    page.getByRole("heading", { name: patientFullName, level: 1 }),
  ).toBeVisible();
}

export async function openRecordTab(page: Page) {
  await page.getByRole("tab", { name: "Ficha", exact: true }).click();
}

export const editRecordButton = (page: Page) =>
  page.getByRole("button", { name: "Editar ficha" });

export const saveRecordButton = (page: Page) =>
  page.getByRole("button", { name: "Guardar cambios" });

export const RECORD_SAVED = "Ficha actualizada";
export const HEALTH_DATA_READ_ONLY_NOTE =
  "Los datos de salud solo los edita personal sanitario.";

export async function addAllergy(page: Page, allergy: string) {
  const draft = page.getByPlaceholder("Escribe y pulsa Enter…");
  await draft.fill(allergy);
  await draft.press("Enter");
}

export async function expectNoPatientData(
  page: Page,
  patient: {
    name: string;
    lastName: string;
    documentNumber: string;
    phone: string;
  },
) {
  const html = await page.content();
  for (const hidden of [
    patient.name,
    patient.lastName,
    patient.documentNumber,
    patient.phone,
  ]) {
    expect(html).not.toContain(hidden);
  }
}

export const LAST_COLUMN = "Estado";

export async function expectTableScrollsOnItsOwn(page: Page) {
  const lastHeader = page.getByRole("columnheader", { name: LAST_COLUMN });
  await expect(lastHeader).toBeAttached();
  const rightEdge = async () => {
    const box = await lastHeader.boundingBox();
    return box ? box.x + box.width : 0;
  };
  await page.getByRole("table").hover();
  await page.mouse.wheel(-MOBILE.width, 0);
  await expect.poll(rightEdge).toBeGreaterThan(MOBILE.width);
  await expectNoHorizontalScroll(page);

  await page.mouse.wheel(MOBILE.width, 0);

  await expect.poll(rightEdge).toBeLessThanOrEqual(MOBILE.width);
  await expectNoHorizontalScroll(page);
}
