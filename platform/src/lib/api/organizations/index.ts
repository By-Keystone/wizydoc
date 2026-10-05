import { doFetchJson } from "../fetch";
import type { GetDoctorCountResult, GetClinicCountResult } from "./types";

export const organizationsApi = {
  getClinicCount: (resourceId: string): Promise<GetClinicCountResult> =>
    doFetchJson(`/organization/${resourceId}/metrics/clinic-count`),
  getDoctorCount: (resourceId: string): Promise<GetDoctorCountResult> =>
    doFetchJson(`/organization/${resourceId}/metrics/doctor-count`),
};
