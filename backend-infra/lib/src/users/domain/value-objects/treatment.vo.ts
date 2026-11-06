import { z } from "zod";

const INVALID_TREATMENT = "Tratamiento inválido";

export const treatmentSchema = z
  .enum(["DR", "DRA"], { error: INVALID_TREATMENT })
  .brand<"TreatmentVO">()
  .optional();

export type TreatmentVO = z.output<typeof treatmentSchema>;
