import { doFetchJson } from "../fetch";
import type {
  ClinicAppointment,
  ClinicMetrics,
  ClinicUser,
  ClinicWithUser,
} from "./types";

export const tags = {
  organizationClinics: (organizationId: string) =>
    `organization-${organizationId}/clinics`,
  clinicUsers: (clinicId: string) => `clinic-${clinicId}/users`,
};

export const clinicApi = {
  getOrganizationClinics: (organizationId: string): Promise<ClinicWithUser[]> =>
    doFetchJson(`/organization/${organizationId}/clinics`, {
      method: "GET",
      next: { tags: [tags.organizationClinics(organizationId)] },
    }),
  getClinicUsers: (clinicId: string): Promise<ClinicUser[]> =>
    doFetchJson(`/clinic/${clinicId}/users`, {
      method: "GET",
      next: { tags: [tags.clinicUsers(clinicId)] },
    }),
  getMetrics: (clinicId: string): Promise<ClinicMetrics> =>
    doFetchJson(`/clinic/${clinicId}/metrics`, {
      method: "GET",
      next: { revalidate: 60 },
    }),
  getTodayAppointments: (clinicId: string): Promise<ClinicAppointment[]> =>
    doFetchJson(`/clinic/${clinicId}/appointments/today`, {
      method: "GET",
    }),
};
