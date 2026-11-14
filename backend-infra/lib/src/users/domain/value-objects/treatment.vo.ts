import { z } from "zod";

const INVALID_TREATMENT = "Tratamiento inválido";

export const TREATMENTS = ["DR", "DRA"] as const;

export const treatmentSchema = z
  .enum(TREATMENTS, { error: INVALID_TREATMENT })
  .brand<"TreatmentVO">();

export type TreatmentVO = z.output<typeof treatmentSchema>;
