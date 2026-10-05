import { doFetchJson } from "../fetch";
import type { ClinicDoctor } from "./types";

export const doctorsApi = {
  // Endpoint público (sin sesión) — usado por el wizard de reserva.
  getDoctorsByResourceId: (resourceId: string): Promise<ClinicDoctor[]> =>
    doFetchJson(`/clinic/${resourceId}/doctors`),
};
