import "server-only";

import { ApiError } from "../errors";
import { doFetchJson } from "../fetch";
import type { ManagedAppointment } from "./types";

const NOT_FOUND_STATUS = 404;

export const appointmentsApi = {
  // El token es la credencial: 404 cubre inválido, expirado y cita ya empezada.
  getManaged: async (token: string): Promise<ManagedAppointment | null> => {
    try {
      return await doFetchJson<ManagedAppointment>(
        `/appointment/manage/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === NOT_FOUND_STATUS)
        return null;
      throw error;
    }
  },
};
