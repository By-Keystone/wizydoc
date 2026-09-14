import { doFetchJson } from "../fetch";
import { PatientDetail, PatientListEntry } from "./types";

export const tags = {
  patient: (patientId: string) => `patient-${patientId}`,
};

export const patientsApi = {
  getAccountPatients: async (
    clinicId?: string,
  ): Promise<PatientListEntry[]> => {
    const query = clinicId ? `?clinicId=${clinicId}` : "";

    const { data } = await doFetchJson<{ data: PatientListEntry[] }>(
      `/patients${query}`,
      { method: "GET" },
    );

    return data;
  },

  getPatientDetail: async (patientId: string): Promise<PatientDetail> => {
    const { data } = await doFetchJson<{ data: PatientDetail }>(
      `/patients/${patientId}`,
      { method: "GET", next: { tags: [tags.patient(patientId)] } },
    );

    return data;
  },
};
