import { doFetchJson } from "../fetch";
import type {
  GetClinicCountResult,
  GetDoctorCountResult,
  OrganizationUser,
} from "./types";

export const tags = {
  organizationUsers: (organizationId: string) =>
    `organization-${organizationId}/users`,
};

export const organizationsApi = {
  getClinicCount: (resourceId: string): Promise<GetClinicCountResult> =>
    doFetchJson(`/organization/${resourceId}/metrics/clinic-count`),
  getDoctorCount: (resourceId: string): Promise<GetDoctorCountResult> =>
    doFetchJson(`/organization/${resourceId}/metrics/doctor-count`),
  getOrganizationUsers: (resourceId: string): Promise<OrganizationUser[]> =>
    doFetchJson(`/organization/${resourceId}/users`, {
      method: "GET",
      next: { tags: [tags.organizationUsers(resourceId)] },
    }),
};
