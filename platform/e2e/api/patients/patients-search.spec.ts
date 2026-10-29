import type { APIResponse } from "@playwright/test";
import { patientsApiUrl } from "../../support/patient-scope";
import {
  createRamosWorld,
  createSearchWorld,
  SEARCH_SPECS,
  type SearchWorld,
} from "../../support/patient-search-world";
import { expect, test } from "../../support/test";

// docs/features/pacientes-busqueda/plan.md — CA-8 a CA-15, CA-17, CA-25 y CA-40 en el api.

interface SearchPage {
  data: { id: string; name: string; lastName: string }[];
  hasMore: boolean;
  nextFrom: string | null;
}

const MAX_SEARCH_CHARACTERS = 80;
const TOO_SHORT_MESSAGE = "Escribe al menos 2 letras o números";
const TOO_LONG_MESSAGE = "La búsqueda admite hasta 80 caracteres";

function searchPatients(
  world: Pick<SearchWorld, "admin">,
  resourceId: string,
  body: Record<string, unknown>,
) {
  return world.admin.context.post(patientsApiUrl(resourceId, "/search"), {
    data: body,
  });
}

async function readPage(response: APIResponse): Promise<SearchPage> {
  expect(response.status()).toBe(200);
  return (await response.json()) as SearchPage;
}

async function matchedIds(
  world: SearchWorld,
  search: string,
): Promise<string[]> {
  const page = await readPage(
    await searchPatients(world, world.clinic.id, { search }),
  );
  return page.data.map((patient) => patient.id).sort();
}

const sorted = (...patients: { id: string }[]) =>
  patients.map((patient) => patient.id).sort();

test.describe("Búsqueda de pacientes en el api", () => {
  test("CA-8: busca por nombre, apellido, documento y teléfono, en cualquier parte del campo", async () => {
    const world = await createSearchWorld("busca-campos");

    expect(await matchedIds(world, "quispe")).toEqual(
      sorted(world.anaMaria, world.luis),
    );
    expect(await matchedIds(world, "ispe")).toEqual(
      sorted(world.anaMaria, world.luis),
    );
    expect(await matchedIds(world, "ana maría")).toEqual(
      sorted(world.anaMaria),
    );
    expect(await matchedIds(world, "45123456")).toEqual(sorted(world.anaMaria));
    expect(await matchedIds(world, "987654321")).toEqual(
      sorted(world.anaMaria),
    );
    expect(await matchedIds(world, "ab12")).toEqual(sorted(world.passport));
  });

  test("CA-9: no distingue mayúsculas ni tildes y la «ñ» vale como «n»", async () => {
    const world = await createSearchWorld("busca-tildes");

    for (const term of ["jose nunez", "JOSE NUNEZ", "José Núñez"]) {
      expect(await matchedIds(world, term)).toEqual(sorted(world.jose));
    }
    expect(await matchedIds(world, "martín garcía")).toEqual(
      sorted(world.martin),
    );
  });

  test("CA-10: con varias palabras cada una debe aparecer, en cualquier orden y en cualquier campo", async () => {
    const world = await createSearchWorld("busca-palabras");

    expect(await matchedIds(world, "ana quis")).toEqual(sorted(world.anaMaria));
    expect(await matchedIds(world, "quis ana")).toEqual(sorted(world.anaMaria));
    expect(await matchedIds(world, "quispe 9876")).toEqual(
      sorted(world.anaMaria),
    );
    expect(await matchedIds(world, "ana zzz")).toEqual([]);
  });

  test("CA-11: un número con separadores se busca como un solo número", async () => {
    const world = await createSearchWorld("busca-numeros");

    for (const term of [
      "987 654 321",
      "987-654-321",
      "(987) 654-321",
      "+51 987654321",
      "45.123.456",
    ]) {
      expect(await matchedIds(world, term)).toEqual(sorted(world.anaMaria));
    }
    expect(await matchedIds(world, "966111222")).toEqual(
      sorted(world.spacedPhone),
    );
  });

  test("CA-12: el correo no se busca", async () => {
    const world = await createSearchWorld("busca-correo");

    expect(await matchedIds(world, "zafiro")).toEqual([]);
  });

  test("CA-13: menos de 2 caracteres sin contar espacios responde 400", async () => {
    const world = await createSearchWorld("busca-minimo");

    for (const search of ["q", "  q  ", "%", " "]) {
      const response = await searchPatients(world, world.clinic.id, { search });
      expect(response.status()).toBe(400);
      expect(await response.text()).toContain(TOO_SHORT_MESSAGE);
    }
    expect(await matchedIds(world, "qu")).toEqual(
      sorted(world.anaMaria, world.luis),
    );
  });

  test("CA-14: más de 80 caracteres responde 400 y 80 se acepta", async () => {
    const world = await createSearchWorld("busca-maximo");

    const tooLong = await searchPatients(world, world.clinic.id, {
      search: "a".repeat(MAX_SEARCH_CHARACTERS + 1),
    });
    expect(tooLong.status()).toBe(400);
    expect(await tooLong.text()).toContain(TOO_LONG_MESSAGE);

    const atLimit = await searchPatients(world, world.clinic.id, {
      search: "a".repeat(MAX_SEARCH_CHARACTERS),
    });
    expect(atLimit.status()).toBe(200);
  });

  test("CA-15: «%», «_» y «\\» se buscan tal cual y nunca traen a todos", async () => {
    const world = await createSearchWorld("busca-comodines");

    for (const term of ["%%", "__", "\\\\"]) {
      expect(await matchedIds(world, term)).toEqual([]);
    }
  });

  test("CA-40: otra cuenta no se ve: su sede da 404 y el mismo documento o teléfono trae sólo a P3", async () => {
    const world = await createSearchWorld("busca-cuentas");
    const { jose, foreign } = world;

    for (const resourceId of [world.clinic.id, world.organization.id]) {
      for (const term of [
        SEARCH_SPECS.jose.documentNumber,
        SEARCH_SPECS.jose.phone,
        "jose nunez",
      ]) {
        const page = await readPage(
          await searchPatients(world, resourceId, { search: term }),
        );
        expect(page.data.map((patient) => patient.id)).toEqual([jose.id]);
      }
    }
    expect(foreign.patient.id).not.toBe(jose.id);

    const intrusion = await searchPatients(world, foreign.clinic.id, {
      search: "jose",
    });
    expect(intrusion.status()).toBe(404);
    expect(await intrusion.json()).toMatchObject({
      message: "Resource not found",
    });
    const listing = await world.admin.context.get(
      patientsApiUrl(foreign.clinic.id),
    );
    expect(listing.status()).toBe(404);
  });

  test("CA-17: con 25 coincidencias la búsqueda trae 20, hasMore y nextFrom, y con from trae las 5 restantes", async () => {
    const world = await createRamosWorld("busca-paginas");
    const ramosNewestFirst = [...world.ramos].reverse().map((p) => p.id);

    const first = await readPage(
      await searchPatients(world, world.clinic.id, { search: "ramos" }),
    );
    expect(first.data).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.nextFrom).toBe(first.data[19].id);
    expect(first.data.map((patient) => patient.id)).toEqual(
      ramosNewestFirst.slice(0, 20),
    );

    const second = await readPage(
      await searchPatients(world, world.clinic.id, {
        search: "ramos",
        from: first.nextFrom,
      }),
    );
    expect(second.data.map((patient) => patient.id)).toEqual(
      ramosNewestFirst.slice(20),
    );
    expect(second.hasMore).toBe(false);
    expect(second.nextFrom).toBeNull();
  });
});
