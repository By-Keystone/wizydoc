import type { Plan } from "@prisma/client";

export type Feature =
  | "PATIENT_RECORD"
  | "CLINIC_METRICS"
  | "DATA_EXPORT"
  | "PATIENT_APPOINTMENT_MANAGEMENT";

interface PlanCapabilities {
  displayName: string;
  nextPlan: Plan | null;
  /** `null` es sin tope: el plan Red se negocia por contrato. */
  monthlyAppointmentCap: number | null;
  includedClinics: number | null;
  /** `null` cuando el plan no se cobra al contratarlo: Gratis no cuesta y Red se negocia aparte. */
  monthlyPriceCents: number | null;
  features: readonly Feature[];
}

/**
 * Qué incluye cada plan. Vive en código y no en base de datos porque cambiarlo
 * cambia también el comportamiento que lo aplica: un plan nuevo sin su feature
 * correspondiente no es un dato mal cargado, es un despliegue incompleto.
 */
export const PLAN_CAPABILITIES: Record<Plan, PlanCapabilities> = {
  FREE: {
    displayName: "Gratis",
    nextPlan: "CONSULTORIO",
    monthlyAppointmentCap: 10,
    includedClinics: 1,
    monthlyPriceCents: null,
    features: [],
  },
  CONSULTORIO: {
    displayName: "Consultorio",
    nextPlan: "CLINICA",
    monthlyAppointmentCap: 150,
    includedClinics: 1,
    monthlyPriceCents: 7900,
    features: ["PATIENT_RECORD", "PATIENT_APPOINTMENT_MANAGEMENT"],
  },
  CLINICA: {
    displayName: "Clínica",
    nextPlan: "RED",
    monthlyAppointmentCap: 600,
    includedClinics: 3,
    monthlyPriceCents: 19900,
    features: [
      "PATIENT_RECORD",
      "CLINIC_METRICS",
      "PATIENT_APPOINTMENT_MANAGEMENT",
    ],
  },
  RED: {
    displayName: "Red",
    nextPlan: null,
    monthlyAppointmentCap: null,
    includedClinics: null,
    monthlyPriceCents: null,
    features: [
      "PATIENT_RECORD",
      "CLINIC_METRICS",
      "DATA_EXPORT",
      "PATIENT_APPOINTMENT_MANAGEMENT",
    ],
  },
};

export function requiresPayment(plan: Plan): boolean {
  return PLAN_CAPABILITIES[plan].monthlyPriceCents !== null;
}
