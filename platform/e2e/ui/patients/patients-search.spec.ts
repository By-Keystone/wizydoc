import type { Page } from "@playwright/test";
import { softDeleteMembership } from "../../support/invitations";
import { addScopeMember, restoreMembership } from "../../support/patient-scope";
import {
  createClinicWithPatients,
  createRamosWorld,
  createSearchWorld,
  type SearchWorld,
} from "../../support/patient-search-world";
import { numberedPatientSpecs } from "../../support/patients";
import {
  clearButton,
  emptyStateClearButton,
  MINIMUM_MESSAGE,
  NO_RESULTS_TITLE,
  openClinicPatients,
  patientRows,
  SEARCH_DEBOUNCE_MILLISECONDS,
  SEARCH_ERROR_TITLE,
  SEARCH_PLACEHOLDER,
  SEE_MORE_PATIENTS,
  SEE_MORE_RESULTS,
  searchBox,
  searchFor,
  searchStatus,
  shownNames,
  toastItems,
  trackServerActions,
  LOAD_MORE_ERROR,
} from "../../support/patients-ui";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-8 a CA-18, CA-20, CA-21, CA-23 a CA-26 y CA-57.

const PAGE_SIZE = 20;
const SEARCH_ERROR_MESSAGE = "Revisa tu conexión y vuelve a intentarlo.";
const MAX_SEARCH_CHARACTERS = 80;
const TYPING_DELAY_MILLISECONDS = 40;

const namesOf = (...patients: { fullName: string }[]) =>
  patients.map((patient) => patient.fullName);

async function openSearchWorld(page: Page, label: string) {
  const world = await createSearchWorld(label);
  await openClinicPatients(
    page,
    world.admin,
    world.admin.accountId,
    world.clinic.id,
  );
  await expect(searchBox(page)).toBeVisible();
  return world;
}

// El orden de la lista es el de alta, así que se compara como conjunto.
async function expectFound(page: Page, term: string, expected: string[]) {
  await searchFor(page, term);
  await expect
    .poll(async () => (await shownNames(page)).sort(), { message: term })
    .toEqual([...expected].sort());
}

function expectedResults(world: SearchWorld) {
  return {
    quispe: namesOf(world.anaMaria, world.luis),
    anaMaria: namesOf(world.anaMaria),
    jose: namesOf(world.jose),
    martin: namesOf(world.martin),
    passport: namesOf(world.passport),
    spacedPhone: namesOf(world.spacedPhone),
  };
}

test.describe("Búsqueda de pacientes en el navegador", () => {
  test("CA-8: se busca por nombre, apellido, documento y teléfono, en cualquier parte del campo", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-campos");
    const expected = expectedResults(world);

    await expectFound(page, "quispe", expected.quispe);
    await expectFound(page, "ispe", expected.quispe);
    await expectFound(page, "ana maría", expected.anaMaria);
    await expectFound(page, "45123456", expected.anaMaria);
    await expectFound(page, "987654321", expected.anaMaria);
    await expectFound(page, "ab12", expected.passport);
  });

  test("CA-9: no distingue mayúsculas ni tildes y la «ñ» vale como «n»", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-tildes");
    const expected = expectedResults(world);

    for (const term of ["jose nunez", "JOSE NUNEZ", "José Núñez"]) {
      await expectFound(page, term, expected.jose);
    }
    await expectFound(page, "martín garcía", expected.martin);
  });

  test("CA-10: con varias palabras cada una debe aparecer, en cualquier orden y en cualquier campo", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-palabras");
    const expected = expectedResults(world);

    await expectFound(page, "ana quis", expected.anaMaria);
    await expectFound(page, "quis ana", expected.anaMaria);
    await expectFound(page, "quispe 9876", expected.anaMaria);
    await expectFound(page, "ana zzz", []);
  });

  test("CA-11: un número con separadores se busca como un solo número", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-numeros");
    const expected = expectedResults(world);

    for (const term of [
      "987 654 321",
      "987-654-321",
      "(987) 654-321",
      "+51 987654321",
      "45.123.456",
    ]) {
      await expectFound(page, term, expected.anaMaria);
    }
    await expectFound(page, "966111222", expected.spacedPhone);
  });

  test("CA-12: el correo no se busca", async ({ page }) => {
    await openSearchWorld(page, "ui-correo");

    await expectFound(page, "zafiro", []);
    await expect(page.getByText(NO_RESULTS_TITLE)).toBeVisible();
  });

  test("CA-13: con 1 carácter la tabla no cambia, no sale ninguna búsqueda y se lee el mínimo; con 2 busca", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-minimo");
    const everyone = await shownNames(page);
    const actions = trackServerActions(page);

    for (const term of ["q", "  q  "]) {
      await searchBox(page).fill(term);
      await expect(searchStatus(page)).toHaveText(MINIMUM_MESSAGE);
      await page.waitForTimeout(2 * SEARCH_DEBOUNCE_MILLISECONDS);
      expect(await shownNames(page)).toEqual(everyone);
    }
    expect(actions.count()).toBe(0);

    await searchBox(page).fill("qu");
    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
    expect((await shownNames(page)).sort()).toEqual(
      namesOf(world.anaMaria, world.luis).sort(),
    );
  });

  test("CA-14: el campo no deja escribir el 81.º carácter", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-maximo");

    await searchBox(page).pressSequentially(
      "a".repeat(MAX_SEARCH_CHARACTERS + 5),
    );

    expect(await searchBox(page).inputValue()).toHaveLength(
      MAX_SEARCH_CHARACTERS,
    );
  });

  test("CA-15: «%», «_» y «\\» se buscan tal cual y nunca traen a todos", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-comodines");

    for (const term of ["%%", "__", "\\\\"]) {
      await expectFound(page, term, []);
      await expect(page.getByText(NO_RESULTS_TITLE)).toBeVisible();
    }
  });

  test("CA-16: sin resultados sale la caja vacía con su texto y «Limpiar búsqueda», sin «Ver más»", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-vacia");

    await searchFor(page, "paola rios");

    await expect(page.getByText(NO_RESULTS_TITLE)).toBeVisible();
    await expect(
      page.getByText("Revisa cómo está escrito o busca por DNI o teléfono."),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Aquí solo aparecen quienes tienen alguna cita en ${world.clinic.name}.`,
      ),
    ).toBeVisible();
    await expect(emptyStateClearButton(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ver más/ })).toHaveCount(0);
    await expect(searchStatus(page)).toHaveText("Ningún paciente encontrado");
  });

  test("CA-17: debajo del campo se lee el número de resultados", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-cuenta");

    await searchFor(page, "José Núñez");
    await expect(searchStatus(page)).toHaveText("1 paciente encontrado");

    await searchFor(page, "quispe");
    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
  });

  test("CA-17: con 25 coincidencias sale «Más de 20», 20 filas y «Ver más resultados» trae las 5 restantes", async ({
    page,
  }) => {
    const world = await createRamosWorld("ui-ramos");
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );
    const ramosNewestFirst = namesOf(...[...world.ramos].reverse());

    await searchFor(page, "ramos");

    await expect(searchStatus(page)).toHaveText(
      "Más de 20 pacientes encontrados",
    );
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
    expect(await shownNames(page)).toEqual(
      ramosNewestFirst.slice(0, PAGE_SIZE),
    );
    await expect(
      page.getByRole("button", { name: SEE_MORE_PATIENTS }),
    ).toHaveCount(0);

    const seeMoreResults = page.getByRole("button", { name: SEE_MORE_RESULTS });
    await seeMoreResults.click();

    await expect(patientRows(page)).toHaveCount(world.ramos.length);
    const everyMatch = await shownNames(page);
    expect(everyMatch).toEqual(ramosNewestFirst);
    for (const name of everyMatch) expect(name).toContain("Ramos");
    await expect(seeMoreResults).toHaveCount(0);
    await expect(searchStatus(page)).toHaveText("25 pacientes encontrados");
  });
});

test.describe("Cuándo busca y cómo se limpia", () => {
  test("CA-18: busca mientras se escribe, sin pulsar nada, y sin recargar ni navegar", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-escribiendo");
    const urlBefore = page.url();
    await page.evaluate(() => {
      (window as unknown as { loadedOnce: boolean }).loadedOnce = true;
    });
    const actions = trackServerActions(page);

    await searchBox(page).pressSequentially("quis", {
      delay: TYPING_DELAY_MILLISECONDS,
    });

    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
    expect(actions.count()).toBe(1);
    expect(page.url()).toBe(urlBefore);
    expect(
      await page.evaluate(
        () => (window as unknown as { loadedOnce?: boolean }).loadedOnce,
      ),
    ).toBe(true);
    expect((await shownNames(page)).sort()).toEqual(
      namesOf(world.anaMaria, world.luis).sort(),
    );
  });

  test("CA-18: Enter busca al instante, sin esperar al retardo, y no recarga ni navega", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-enter");
    const urlBefore = page.url();
    await page.evaluate(() => {
      (window as unknown as { loadedOnce: boolean }).loadedOnce = true;
    });
    let firstRequestAt = 0;
    let requests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) {
        requests += 1;
        if (firstRequestAt === 0) firstRequestAt = Date.now();
      }
    });

    await searchBox(page).fill("luis");
    const enterPressedAt = Date.now();
    await searchBox(page).press("Enter");

    await expect(searchStatus(page)).toHaveText("1 paciente encontrado");
    expect(firstRequestAt - enterPressedAt).toBeLessThan(
      SEARCH_DEBOUNCE_MILLISECONDS,
    );
    await page.waitForTimeout(2 * SEARCH_DEBOUNCE_MILLISECONDS);
    expect(requests).toBe(1);
    expect(page.url()).toBe(urlBefore);
    expect(
      await page.evaluate(
        () => (window as unknown as { loadedOnce?: boolean }).loadedOnce,
      ),
    ).toBe(true);
  });

  test("CA-20: la «x», borrar el texto y «Limpiar búsqueda» devuelven la lista, sin petición nueva y con el foco en el campo", async ({
    page,
  }) => {
    const world = await createClinicWithPatients(
      "ui-limpiar",
      numberedPatientSpecs(30, "Larga", 63000000),
    );
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );
    const firstPage = await shownNames(page);
    expect(firstPage).toHaveLength(PAGE_SIZE);
    await expect(clearButton(page)).toHaveCount(0);
    const actions = trackServerActions(page);
    const expectBackToFirstPage = async (requestsBefore: number) => {
      await expect(patientRows(page)).toHaveCount(PAGE_SIZE);
      expect(await shownNames(page)).toEqual(firstPage);
      await expect(searchBox(page)).toHaveValue("");
      await expect(searchBox(page)).toBeFocused();
      expect(actions.count()).toBe(requestsBefore);
    };

    await searchFor(page, "Paciente05");
    await expect(searchStatus(page)).toHaveText("1 paciente encontrado");
    await expect(clearButton(page)).toBeVisible();
    let requests = actions.count();
    await clearButton(page).click();
    await expectBackToFirstPage(requests);

    await searchFor(page, "Paciente06");
    await expect(searchStatus(page)).toHaveText("1 paciente encontrado");
    requests = actions.count();
    await searchBox(page).press("ControlOrMeta+a");
    await searchBox(page).press("Backspace");
    await expectBackToFirstPage(requests);

    await searchFor(page, "paola rios");
    await expect(emptyStateClearButton(page)).toBeVisible();
    requests = actions.count();
    await emptyStateClearButton(page).click();
    await expectBackToFirstPage(requests);
  });
});

test.describe("Búsqueda fallida y regreso de la ficha", () => {
  test("CA-21: sale «No pudimos buscar» sin toast ni mensaje del api, el campo conserva el término y «Reintentar» repite la búsqueda", async ({
    page,
  }) => {
    const world = await createSearchWorld("ui-error");
    const doctor = await addScopeMember(
      world,
      "DOCTOR",
      world.clinic.id,
      "ui-error",
    );
    await openClinicPatients(
      page,
      doctor,
      world.admin.accountId,
      world.clinic.id,
    );
    await softDeleteMembership(doctor.membershipId);

    await searchFor(page, "quispe");

    await expect(page.getByText(SEARCH_ERROR_TITLE)).toBeVisible();
    await expect(page.getByText(SEARCH_ERROR_MESSAGE)).toBeVisible();
    await expect(patientRows(page)).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("quispe");
    await expect(page.getByText("Resource not found")).toHaveCount(0);
    await expect(page.getByText(LOAD_MORE_ERROR)).toHaveCount(0);
    await expect(toastItems(page)).toHaveCount(0);

    await restoreMembership(doctor.membershipId);
    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
    expect((await shownNames(page)).sort()).toEqual(
      namesOf(world.anaMaria, world.luis).sort(),
    );
    await expect(page.getByText(SEARCH_ERROR_TITLE)).toHaveCount(0);
  });

  test("CA-23: al volver de la ficha, con el enlace «Pacientes» o con el botón atrás, la búsqueda empieza vacía", async ({
    page,
  }) => {
    const world = await openSearchWorld(page, "ui-volver");
    const everyone = await shownNames(page);

    for (const goBack of [
      () =>
        page
          .getByRole("main")
          .getByRole("link", { name: "Pacientes", exact: true })
          .click(),
      () => page.goBack(),
    ]) {
      await searchFor(page, "quispe");
      await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
      await page.getByRole("link", { name: world.luis.fullName }).click();
      await expect(
        page.getByRole("heading", { name: world.luis.fullName, level: 1 }),
      ).toBeVisible();

      await goBack();

      await expect(
        page.getByRole("heading", { name: "Pacientes", level: 1 }),
      ).toBeVisible();
      await expect(searchBox(page)).toHaveValue("");
      await expect(patientRows(page)).toHaveCount(everyone.length);
      expect((await shownNames(page)).sort()).toEqual([...everyone].sort());
    }
  });
});

test.describe("Privacidad del término", () => {
  test("CA-24: al buscar, al pulsar «Ver más resultados» y al limpiar, la URL, el historial y el título no cambian", async ({
    page,
  }) => {
    const world = await createRamosWorld("ui-url");
    await openClinicPatients(
      page,
      world.admin,
      world.admin.accountId,
      world.clinic.id,
    );
    const urlBefore = page.url();
    const historyLength = () => page.evaluate(() => window.history.length);
    const historyBefore = await historyLength();

    await searchFor(page, "ramos");
    await expect(searchStatus(page)).toHaveText(
      "Más de 20 pacientes encontrados",
    );
    await page.getByRole("button", { name: SEE_MORE_RESULTS }).click();
    await expect(patientRows(page)).toHaveCount(world.ramos.length);
    await clearButton(page).click();
    await expect(patientRows(page)).toHaveCount(PAGE_SIZE);

    expect(page.url()).toBe(urlBefore);
    expect(page.url().toLowerCase()).not.toContain("ramos");
    expect(await historyLength()).toBe(historyBefore);
    await expect(page).toHaveTitle("Pacientes · WizyDoc");
  });

  test("CA-25: ninguna petición del navegador lleva el término en su URL; sólo va en el cuerpo de un POST", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-cuerpo");
    const term = "quispe";
    const duringSearch: { method: string; url: string; body: string | null }[] =
      [];
    page.on("request", (request) => {
      duringSearch.push({
        method: request.method(),
        url: request.url(),
        body: request.postData(),
      });
    });

    await searchFor(page, term);
    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");

    expect(duringSearch.length).toBeGreaterThan(0);
    for (const request of duringSearch) {
      expect(decodeURIComponent(request.url).toLowerCase()).not.toContain(term);
    }
    const carriers = duringSearch.filter((request) =>
      request.body?.toLowerCase().includes(term),
    );
    expect(carriers.length).toBeGreaterThan(0);
    for (const carrier of carriers) expect(carrier.method).toBe("POST");
  });

  test("CA-26: el campo es type=search, con autocomplete=off, enterkeyhint=search y maxlength=80", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-atributos");

    const field = searchBox(page);
    await expect(field).toHaveAttribute("type", "search");
    await expect(field).toHaveAttribute("autocomplete", "off");
    await expect(field).toHaveAttribute("enterkeyhint", "search");
    await expect(field).toHaveAttribute(
      "maxlength",
      String(MAX_SEARCH_CHARACTERS),
    );
  });
});

test.describe("Accesibilidad del buscador", () => {
  test("CA-57: el campo es un searchbox llamado «Buscar paciente» dentro de un search, y la línea de estado anuncia cada estado", async ({
    page,
  }) => {
    await openSearchWorld(page, "ui-a11y");

    const search = page.getByRole("search");
    await expect(
      search.getByRole("searchbox", { name: "Buscar paciente" }),
    ).toHaveAttribute("placeholder", SEARCH_PLACEHOLDER);

    await searchBox(page).fill("q");
    await expect(searchStatus(page)).toHaveText(MINIMUM_MESSAGE);
    await searchFor(page, "quispe");
    await expect(searchStatus(page)).toHaveText("2 pacientes encontrados");
    await searchFor(page, "paola rios");
    await expect(searchStatus(page)).toHaveText("Ningún paciente encontrado");
  });
});
