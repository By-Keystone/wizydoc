import assert from "node:assert/strict";
import { test } from "node:test";
import { weeklyScheduleSchema } from "../../lib/src/users/domain/value-objects/weekly-schedule.vo";

const block = (dayOfWeek: number, startTime: string, endTime: string) => ({
  dayOfWeek,
  startTime,
  endTime,
});

const firstMessage = (raw: unknown) =>
  weeklyScheduleSchema.safeParse(raw).error?.issues[0]?.message;

test("el horario semanal responde el mensaje de la spec para cada regla", () => {
  assert.equal(
    firstMessage("lunes"),
    "La disponibilidad debe ser una lista de rangos",
  );
  assert.equal(
    firstMessage([1]),
    "Cada rango debe ser un objeto con día, inicio y fin",
  );
  assert.equal(
    firstMessage([block("1" as unknown as number, "09:00", "10:00")]),
    "El día de la semana debe ser un número",
  );
  assert.equal(
    firstMessage([block(1.5, "09:00", "10:00")]),
    "El día de la semana debe ser un entero",
  );
  assert.equal(
    firstMessage([block(7, "09:00", "10:00")]),
    "El día de la semana debe estar entre 0 y 6",
  );
  assert.equal(
    firstMessage([block(-1, "09:00", "10:00")]),
    "El día de la semana debe estar entre 0 y 6",
  );
  assert.equal(
    firstMessage([block(1, 900 as unknown as string, "10:00")]),
    "La hora debe ser un texto con formato HH:mm",
  );
  assert.equal(
    firstMessage([block(1, "24:00", "25:00")]),
    "La hora debe tener formato HH:mm entre 00:00 y 23:59",
  );
  assert.equal(
    firstMessage([block(1, "10:00", "09:00")]),
    "La hora de inicio debe ser anterior a la hora de fin",
  );
  assert.equal(
    firstMessage([block(1, "09:00", "09:00")]),
    "La hora de inicio debe ser anterior a la hora de fin",
  );
});

test("el inicio posterior al fin se reporta en endTime", () => {
  const { error } = weeklyScheduleSchema.safeParse([
    block(1, "10:00", "09:00"),
  ]);
  assert.deepEqual(error?.issues[0]?.path, [0, "endTime"]);
});

test("dos bloques del mismo día que se solapan responden con el nombre del día", () => {
  assert.equal(
    firstMessage([block(1, "09:00", "12:00"), block(1, "11:00", "14:00")]),
    "Los rangos del lunes no pueden solaparse",
  );
  assert.equal(
    firstMessage([block(0, "09:00", "12:00"), block(0, "10:00", "11:00")]),
    "Los rangos del domingo no pueden solaparse",
  );
  assert.equal(
    weeklyScheduleSchema.safeParse([
      block(1, "09:00", "12:00"),
      block(1, "12:00", "14:00"),
      block(2, "09:00", "12:00"),
    ]).success,
    true,
  );
});

test("el horario semanal acepta 70 bloques y no 71", () => {
  const blocks = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      block(
        Math.floor(index / 10),
        `${String(index % 10).padStart(2, "0")}:00`,
        `${String(index % 10).padStart(2, "0")}:30`,
      ),
    );

  assert.equal(weeklyScheduleSchema.safeParse(blocks(70)).success, true);
  assert.equal(
    firstMessage(blocks(71)),
    "No puedes registrar más de 70 rangos de disponibilidad",
  );
});

test("un horario semanal vacío responde La solicitud no es válida.", () => {
  assert.equal(firstMessage([]), "La solicitud no es válida.");
});

test("el horario semanal sale ordenado por día y hora de inicio, con las horas tal cual", () => {
  assert.deepEqual(
    weeklyScheduleSchema.parse([
      block(2, "09:00", "10:00"),
      block(1, "15:00", "18:00"),
      block(1, "08:30", "12:00"),
    ]),
    [
      block(1, "08:30", "12:00"),
      block(1, "15:00", "18:00"),
      block(2, "09:00", "10:00"),
    ],
  );
});
