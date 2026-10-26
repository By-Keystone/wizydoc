import { doFetchJson } from "../fetch";
import type { PatientDetail, PatientListEntry, PatientsPage } from "./types";

export const tags = {
  patient: (patientId: string) => `patient-${patientId}`,
};

interface PageRequest {
  resourceId: string;
  from?: string;
}

interface SearchRequest extends PageRequest {
  search: string;
}

interface PatientsResponse {
  data: PatientListEntry[];
  hasMore: boolean;
  nextFrom: string | null;
}

const patientsPath = (resourceId: string) =>
  `/patients/in/${encodeURIComponent(resourceId)}`;

const toPage = ({
  data,
  hasMore,
  nextFrom,
}: PatientsResponse): PatientsPage => ({
  patients: data,
  hasMore,
  nextFrom,
});

export const patientsApi = {
  getPatients: async ({ resourceId, from }: PageRequest) => {
    const query = from ? `?${new URLSearchParams({ from })}` : "";

    return toPage(
      await doFetchJson<PatientsResponse>(
        `${patientsPath(resourceId)}${query}`,
        { method: "GET", cache: "no-store" },
      ),
    );
  },

  // El término viaja en el cuerpo y no en la URL, para que no quede en ningún log de acceso.
  searchPatients: async ({ resourceId, search, from }: SearchRequest) =>
    toPage(
      await doFetchJson<PatientsResponse>(
        `${patientsPath(resourceId)}/search`,
        {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ search, from }),
        },
      ),
    ),

  getPatientDetail: async (
    resourceId: string,
    patientId: string,
  ): Promise<PatientDetail> => {
    const { data } = await doFetchJson<{ data: PatientDetail }>(
      `${patientsPath(resourceId)}/${encodeURIComponent(patientId)}`,
      { method: "GET", next: { tags: [tags.patient(patientId)] } },
    );

    return data;
  },
};
