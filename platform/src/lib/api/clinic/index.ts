import { doFetchJson } from "../fetch";
import type {
  BookingStatus,
  BookingUsage,
  ClinicAppointment,
  ClinicLocation,
  ClinicMember,
  ClinicMetrics,
  ClinicWithUser,
} from "./types";

export const tags = {
  organizationClinics: (organizationId: string) =>
    `organization-${organizationId}/clinics`,
  clinicUsers: (clinicId: string) => `clinic-${clinicId}/users`,
  bookingUsage: (clinicId: string) => `clinic-${clinicId}/booking-usage`,
};

export const clinicApi = {
  getOrganizationClinics: (organizationId: string): Promise<ClinicWithUser[]> =>
    doFetchJson(`/organization/${organizationId}/clinics`, {
      method: "GET",
      next: { tags: [tags.organizationClinics(organizationId)] },
    }),
  getClinicUsers: (clinicId: string): Promise<ClinicMember[]> =>
    doFetchJson(`/clinic/${clinicId}/users`, {
      method: "GET",
      next: { tags: [tags.clinicUsers(clinicId)] },
    }),
  getMetrics: (clinicId: string): Promise<ClinicMetrics> =>
    doFetchJson(`/clinic/${clinicId}/metrics`, {
      method: "GET",
      next: { revalidate: 60 },
    }),
  getLocation: (clinicId: string): Promise<ClinicLocation> =>
    doFetchJson(`/clinic/${clinicId}/location`),
  // Pública: la lee el booking del paciente, sin sesión.
  getBookingStatus: (clinicId: string): Promise<BookingStatus> =>
    doFetchJson(`/clinic/${clinicId}/booking-status`, { cache: "no-store" }),
  getBookingUsage: (clinicId: string): Promise<BookingUsage> =>
    doFetchJson(`/clinic/${clinicId}/booking-usage`, {
      cache: "no-store",
      next: { tags: [tags.bookingUsage(clinicId)] },
    }),
  getTodayAppointments: (clinicId: string): Promise<ClinicAppointment[]> =>
    doFetchJson(`/clinic/${clinicId}/appointments/today`, {
      method: "GET",
    }),
};
