export const PLAN_VALUES = ["FREE", "CONSULTORIO", "CLINICA", "RED"] as const;

export type Plan = (typeof PLAN_VALUES)[number];

export const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "FREE", label: "Gratis · 1 médico, 1 sede" },
  { value: "CONSULTORIO", label: "Consultorio · S/ 79 al mes · 3 médicos" },
  { value: "CLINICA", label: "Clínica · S/ 199 al mes · 8 médicos, 3 sedes" },
  { value: "RED", label: "Red · a medida" },
];
