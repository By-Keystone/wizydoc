import type { Plan } from "@prisma/client";

export type Feature = "PATIENT_RECORD" | "CLINIC_METRICS" | "DATA_EXPORT";

interface PlanCapabilities {
  /** `null` es ilimitado: el plan Red se negocia por contrato, no por tope. */
  includedDoctors: number | null;
  includedClinics: number | null;
  features: readonly Feature[];
}

/**
 * Qué incluye cada plan. Vive en código y no en base de datos porque cambiarlo
 * cambia también el comportamiento que lo aplica: un plan nuevo sin su feature
 * correspondiente no es un dato mal cargado, es un despliegue incompleto.
 */
export const PLAN_CAPABILITIES: Record<Plan, PlanCapabilities> = {
  FREE: {
    includedDoctors: 1,
    includedClinics: 1,
    features: [],
  },
  CONSULTORIO: {
    includedDoctors: 3,
    includedClinics: 1,
    features: ["PATIENT_RECORD"],
  },
  CLINICA: {
    includedDoctors: 8,
    includedClinics: 3,
    features: ["PATIENT_RECORD", "CLINIC_METRICS"],
  },
  RED: {
    includedDoctors: null,
    includedClinics: null,
    features: ["PATIENT_RECORD", "CLINIC_METRICS", "DATA_EXPORT"],
  },
};
