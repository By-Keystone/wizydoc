import z from "zod";
import { addDays, today } from "@/domain/services/clinic-time";

const MAX_RANGE_DAYS = 31;
const MAX_DAYS_IN_THE_PAST = 7;
const MAX_DAYS_AHEAD = 366;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const dateKey = z.iso.date({
  error: "La fecha debe ser válida y tener formato YYYY-MM-DD",
});

function hasNoPriorIssues(payload: { issues: unknown[] }): boolean {
  return payload.issues.length === 0;
}

export function daysInclusive(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MILLISECONDS_PER_DAY + 1;
}

export const getDoctorSlotsParamsSchema = z.object({
  doctorProfileId: z.string(),
});

/** Rango inclusivo de días. El wizard pide una semana de golpe. */
export const getDoctorSlotsQuerySchema = z
  .object({ from: dateKey, to: dateKey })
  .refine((q) => q.from <= q.to, {
    error: "`from` no puede ser posterior a `to`",
    when: hasNoPriorIssues,
  })
  .refine((q) => daysInclusive(q.from, q.to) <= MAX_RANGE_DAYS, {
    error: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
    when: hasNoPriorIssues,
  })
  .refine((q) => q.from >= addDays(today(), -MAX_DAYS_IN_THE_PAST), {
    error: `La fecha inicial no puede ser anterior a ${MAX_DAYS_IN_THE_PAST} días atrás`,
    when: hasNoPriorIssues,
  })
  .refine((q) => q.to <= addDays(today(), MAX_DAYS_AHEAD), {
    error: `La fecha final no puede superar ${MAX_DAYS_AHEAD} días desde hoy`,
    when: hasNoPriorIssues,
  });

export type GetDoctorSlotsDto = z.infer<typeof getDoctorSlotsParamsSchema> &
  z.infer<typeof getDoctorSlotsQuerySchema>;

export interface DoctorSlots {
  /**
   * Duración de cada hueco. La decide el api para que el cliente no tenga que
   * conocerla al crear la cita.
   */
  durationMinutes: number;
  /** Horas libres por día (`YYYY-MM-DD` → `["09:00", "09:30"]`). */
  days: Record<string, string[]>;
}

export interface IGetDoctorSlotsQuery {
  execute(dto: GetDoctorSlotsDto): Promise<DoctorSlots>;
}
