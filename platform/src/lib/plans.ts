export const PLAN_VALUES = ["FREE", "CONSULTORIO", "CLINICA", "RED"] as const;

export type Plan = (typeof PLAN_VALUES)[number];

interface PlanOption {
  value: Plan;
  label: string;
  /** `null` cuando el plan no se cobra en el onboarding: Gratis no cuesta y Red se negocia aparte. */
  amountCents: number | null;
}

export const PLAN_OPTIONS: PlanOption[] = [
  { value: "FREE", label: "Gratis · 1 médico, 1 sede", amountCents: null },
  { value: "CONSULTORIO", label: "Consultorio · S/ 79 al mes · 3 médicos", amountCents: 7900 },
  { value: "CLINICA", label: "Clínica · S/ 199 al mes · 8 médicos, 3 sedes", amountCents: 19900 },
  { value: "RED", label: "Red · a medida", amountCents: null },
];

export function planAmountCents(plan: Plan): number | null {
  return PLAN_OPTIONS.find((option) => option.value === plan)?.amountCents ?? null;
}
