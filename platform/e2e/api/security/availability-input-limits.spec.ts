import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  type AvailabilityBlock,
  type ClinicDoctor,
  MAX_AVAILABILITY_BLOCKS,
  createClinicDoctor,
  nonOverlappingBlocks,
} from "../../support/availability";

type Block = AvailabilityBlock;
type Doctor = ClinicDoctor;

function block(dayOfWeek: number, startTime: string, endTime: string): Block {
  return { dayOfWeek, startTime, endTime };
}

async function putAvailability(doctor: Doctor, availabilities: Block[]) {
  return doctor.context.put(
    `${API_BASE_URL}/clinic/${doctor.clinicId}/availability`,
    { data: { availabilities } },
  );
}

async function getAvailability(doctor: Doctor): Promise<Block[]> {
  const response = await doctor.context.get(
    `${API_BASE_URL}/clinic/${doctor.clinicId}/availability`,
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { availabilities: Block[] };
  return body.availabilities.map(({ dayOfWeek, startTime, endTime }) => ({
    dayOfWeek,
    startTime,
    endTime,
  }));
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
  );
}

test.describe("PUT /clinic/:resourceId/availability valida su entrada", () => {
  test("un horario típico con turno partido se guarda y reemplaza el anterior", async () => {
    const doctor = await createClinicDoctor("valid");
    const typical = [
      block(1, "09:00", "13:00"),
      block(1, "14:00", "18:00"),
      block(2, "09:00", "13:00"),
      block(0, "00:00", "23:59"),
      block(3, "09:00", "10:00"),
      block(3, "10:00", "11:00"),
    ];

    const response = await putAvailability(doctor, typical);
    expect(response.ok()).toBe(true);
    expect(sortBlocks(await getAvailability(doctor))).toEqual(
      sortBlocks(typical),
    );

    const replacement = [block(5, "08:00", "12:00")];
    expect((await putAvailability(doctor, replacement)).ok()).toBe(true);
    expect(await getAvailability(doctor)).toEqual(replacement);

    expect((await putAvailability(doctor, [])).ok()).toBe(true);
    expect(await getAvailability(doctor)).toEqual([]);
  });

  test("el máximo de rangos se acepta", async () => {
    const doctor = await createClinicDoctor("max");
    const full = nonOverlappingBlocks(MAX_AVAILABILITY_BLOCKS);

    const response = await putAvailability(doctor, full);
    expect(response.ok()).toBe(true);
    expect(await getAvailability(doctor)).toHaveLength(MAX_AVAILABILITY_BLOCKS);
  });

  const invalidBodies: [string, Block[], string?][] = [
    [
      "hora 25:00",
      [block(1, "25:00", "26:00")],
      "La hora debe tener formato HH:mm",
    ],
    ["hora sin cero inicial 9:5", [block(1, "9:5", "10:00")]],
    ["hora no numérica", [block(1, "ab", "10:00")]],
    ["fin 24:00", [block(1, "09:00", "24:00")]],
    ["inicio igual al fin", [block(1, "09:00", "09:00")]],
    [
      "inicio posterior al fin",
      [block(1, "10:00", "09:00")],
      "La hora de inicio debe ser anterior a la hora de fin",
    ],
    [
      "rangos solapados",
      [block(1, "09:00", "12:00"), block(1, "11:00", "15:00")],
      "Los rangos del lunes no pueden solaparse",
    ],
    [
      "rango contenido en otro, fuera de orden",
      [block(2, "13:00", "14:00"), block(2, "09:00", "18:00")],
    ],
    ["día 7", [block(7, "09:00", "10:00")]],
    ["día negativo", [block(-1, "09:00", "10:00")]],
    ["día fraccionario", [block(1.5, "09:00", "10:00")]],
    [
      "más del máximo de rangos sin solapes",
      nonOverlappingBlocks(MAX_AVAILABILITY_BLOCKS + 1),
      `más de ${MAX_AVAILABILITY_BLOCKS} rangos`,
    ],
    [
      "miles de rangos 00:00-23:59",
      Array.from({ length: 15000 }, () => block(1, "00:00", "23:59")),
      `más de ${MAX_AVAILABILITY_BLOCKS} rangos`,
    ],
  ];

  for (const [name, availabilities, message] of invalidBodies) {
    test(`rechaza con 400 y no toca lo guardado: ${name}`, async () => {
      const doctor = await createClinicDoctor("invalid");
      const saved = [block(4, "09:00", "12:00")];
      expect((await putAvailability(doctor, saved)).ok()).toBe(true);

      const response = await putAvailability(doctor, availabilities);

      expect(response.status()).toBe(400);
      if (message) expect(await response.text()).toContain(message);
      expect(await getAvailability(doctor)).toEqual(saved);
    });
  }

  test("los rangos contiguos de un mismo día no cuentan como solape", async () => {
    const doctor = await createClinicDoctor("contiguous");
    const contiguous = [block(1, "09:00", "12:00"), block(1, "12:00", "15:00")];

    expect((await putAvailability(doctor, contiguous)).ok()).toBe(true);
  });
});
