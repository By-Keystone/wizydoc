import { doFetchJson } from "../fetch";
import type { Specialty } from "./types";

export const tags = {
  organizationSpecialties: (organizationId: string) =>
    `organization-${organizationId}/specialties`,
};

export const specialtyApi = {
  getOrganizationSpecialties: async (
    organizationId: string,
  ): Promise<Specialty[]> => {
    const data = await doFetchJson<{ specialties: Specialty[] }>(
      `/${organizationId}/specialties`,
      {
        method: "GET",
        next: { tags: [tags.organizationSpecialties(organizationId)] },
      },
    );

    return data.specialties;
  },
};
