import z from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  error: "La fecha debe tener formato YYYY-MM-DD",
});

export const getDoctorSlotsParamsSchema = z.object({
  doctorProfileId: z.string(),
});

/** Rango inclusivo de días. El wizard pide una semana de golpe. */
export const getDoctorSlotsQuerySchema = z
  .object({ from: dateKey, to: dateKey })
  .refine((q) => q.from <= q.to, {
    error: "`from` no puede ser posterior a `to`",
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
