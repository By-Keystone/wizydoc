import type { ClinicUser } from "../clinic/types";

export type GetClinicCountResult = {
  clinicCount: number;
};

export type GetDoctorCountResult = {
  doctorCount: number;
};

export type OrganizationUser = ClinicUser & {
  invitationStatus: "pending" | "expired" | null;
};
