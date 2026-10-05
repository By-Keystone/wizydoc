import { doFetchJson } from "../fetch";
import type { AvailabilityBlock } from "./types";

export const tags = {
  clinicAvailability: (clinicId: string) => `clinic-${clinicId}/availability`,
};

export const availabilityApi = {
  /**
   * Disponibilidad del doctor autenticado en una clínica. El backend resuelve
   * el doctor por la sesión + el clinicId.
   */
  getMyAvailability: async (clinicId: string): Promise<AvailabilityBlock[]> => {
    const data = await doFetchJson<{ availabilities: AvailabilityBlock[] }>(
      `/clinic/${clinicId}/availability`,
      {
        method: "GET",
        next: { tags: [tags.clinicAvailability(clinicId)] },
      },
    );
    return data.availabilities;
  },
};
