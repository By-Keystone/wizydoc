import { z } from "zod";
import { INVALID_REQUEST } from "../../../shared/messages";

const MAX_SCHEDULE_BLOCKS = 70;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const clockTime = z
  .string({ error: "La hora debe ser un texto con formato HH:mm" })
  .regex(CLOCK_TIME_PATTERN, {
    error: "La hora debe tener formato HH:mm entre 00:00 y 23:59",
  });

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const hasValidTimes = (block: { startTime: string; endTime: string }) =>
  CLOCK_TIME_PATTERN.test(block.startTime) &&
  CLOCK_TIME_PATTERN.test(block.endTime);

const scheduleBlockSchema = z
  .object(
    {
      dayOfWeek: z
        .number({ error: "El día de la semana debe ser un número" })
        .int({ error: "El día de la semana debe ser un entero" })
        .min(0, { error: "El día de la semana debe estar entre 0 y 6" })
        .max(6, { error: "El día de la semana debe estar entre 0 y 6" }),
      startTime: clockTime,
      endTime: clockTime,
    },
    { error: "Cada rango debe ser un objeto con día, inicio y fin" },
  )
  .refine(
    (block) =>
      !hasValidTimes(block) ||
      toMinutes(block.startTime) < toMinutes(block.endTime),
    {
      error: "La hora de inicio debe ser anterior a la hora de fin",
      path: ["endTime"],
    },
  );

type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;

const byDayAndStart = (a: ScheduleBlock, b: ScheduleBlock): number =>
  a.dayOfWeek - b.dayOfWeek || toMinutes(a.startTime) - toMinutes(b.startTime);

const findOverlappingDay = (blocks: ScheduleBlock[]): number | undefined => {
  const ordered = blocks
    .filter(
      (block) =>
        hasValidTimes(block) && block.dayOfWeek >= 0 && block.dayOfWeek <= 6,
    )
    .sort(byDayAndStart);
  return ordered.find((block, index) => {
    const previous = ordered[index - 1];
    return (
      previous !== undefined &&
      previous.dayOfWeek === block.dayOfWeek &&
      toMinutes(block.startTime) < toMinutes(previous.endTime)
    );
  })?.dayOfWeek;
};

export const weeklyScheduleSchema = z
  .array(scheduleBlockSchema, {
    error: "La disponibilidad debe ser una lista de rangos",
  })
  .min(1, { error: INVALID_REQUEST })
  .max(MAX_SCHEDULE_BLOCKS, {
    error: `No puedes registrar más de ${MAX_SCHEDULE_BLOCKS} rangos de disponibilidad`,
  })
  .superRefine((blocks, context) => {
    if (blocks.length > MAX_SCHEDULE_BLOCKS) return;
    const overlappingDay = findOverlappingDay(blocks);
    if (overlappingDay === undefined) return;
    context.addIssue({
      code: "custom",
      message: `Los rangos del ${DAY_NAMES[overlappingDay]} no pueden solaparse`,
    });
  })
  .transform((blocks) => [...blocks].sort(byDayAndStart))
  .brand<"WeeklyScheduleVO">();

export type WeeklyScheduleVO = z.output<typeof weeklyScheduleSchema>;
