export const DoctorTreatment = {
  DR: "DR",
  DRA: "DRA",
} as const;

export type DoctorTreatment =
  (typeof DoctorTreatment)[keyof typeof DoctorTreatment];
