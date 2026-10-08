export type Slot = { startTime: string; endTime: string };
export type ScheduleByDay = Record<number, Slot[]>;

export type ScheduleErrors = {
  total?: string;
  rows: Record<number, Record<number, string>>;
};

// Espejo de api/src/application/use-cases/availability/insert-availability.usecase.ts,
// que es la fuente de verdad: si cambian allí, cambian aquí.
export const MAX_AVAILABILITY_BLOCKS = 70;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeError(slot: Slot): string | undefined {
  if (!slot.startTime || !slot.endTime)
    return "Ingresa la hora de inicio y de fin";
  if (
    !CLOCK_TIME_PATTERN.test(slot.startTime) ||
    !CLOCK_TIME_PATTERN.test(slot.endTime)
  )
    return "La hora debe tener formato HH:mm entre 00:00 y 23:59";
  if (toMinutes(slot.startTime) >= toMinutes(slot.endTime))
    return "La hora de inicio debe ser anterior a la hora de fin";
  return undefined;
}

function overlapErrors(
  slots: Slot[],
  hasOwnError: boolean[],
): Record<number, string> {
  const ordered = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ index }) => !hasOwnError[index])
    .sort((a, b) => toMinutes(a.slot.startTime) - toMinutes(b.slot.startTime));

  const errors: Record<number, string> = {};
  ordered.forEach(({ slot, index }, position) => {
    const previous = ordered[position - 1]?.slot;
    if (previous && toMinutes(slot.startTime) < toMinutes(previous.endTime)) {
      errors[index] =
        `Se solapa con el rango ${previous.startTime} - ${previous.endTime}`;
    }
  });
  return errors;
}

export function validateSchedule(schedule: ScheduleByDay): ScheduleErrors {
  const rows: ScheduleErrors["rows"] = {};
  let totalBlocks = 0;

  for (const [day, slots] of Object.entries(schedule)) {
    totalBlocks += slots.length;
    const ownErrors = slots.map(timeError);
    const dayErrors = overlapErrors(slots, ownErrors.map(Boolean));
    slots.forEach((_, index) => {
      const message = ownErrors[index] ?? dayErrors[index];
      if (message)
        rows[Number(day)] = { ...rows[Number(day)], [index]: message };
    });
  }

  const total =
    totalBlocks > MAX_AVAILABILITY_BLOCKS
      ? `No puedes registrar más de ${MAX_AVAILABILITY_BLOCKS} rangos de disponibilidad`
      : undefined;
  return { total, rows };
}

export function hasScheduleErrors(errors: ScheduleErrors): boolean {
  return Boolean(errors.total) || Object.keys(errors.rows).length > 0;
}
