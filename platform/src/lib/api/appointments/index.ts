import { ApiError } from "../errors";
import type { DoctorSlots } from "../doctor-profile/types";
import { doFetchJson } from "../fetch";
import type {
  AppointmentPortal,
  CancellationReason,
  RescheduleAvailability,
} from "./types";

const NOT_FOUND = 404;

function manageUrl(token: string): string {
  return `/appointment/manage/${encodeURIComponent(token)}`;
}

export const appointmentsApi = {
  // Endpoints públicos (sin sesión): el token del enlace del correo es la credencial.
  getPortal: async (token: string): Promise<AppointmentPortal | null> => {
    try {
      return await doFetchJson<AppointmentPortal>(manageUrl(token), {
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === NOT_FOUND) return null;
      throw error;
    }
  },

  cancel: (
    token: string,
    expectedScheduledAt: string,
    reason: CancellationReason,
  ): Promise<AppointmentPortal> =>
    doFetchJson(`${manageUrl(token)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ expectedScheduledAt, reason }),
      cache: "no-store",
    }),

  reschedule: (
    token: string,
    scheduledAt: string,
    expectedScheduledAt: string,
  ): Promise<AppointmentPortal> =>
    doFetchJson(`${manageUrl(token)}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt, expectedScheduledAt }),
      cache: "no-store",
    }),

  getRescheduleSlots: (
    token: string,
    from: string,
    to: string,
  ): Promise<DoctorSlots> => {
    const search = new URLSearchParams({ from, to });
    return doFetchJson(`${manageUrl(token)}/slots?${search.toString()}`, {
      cache: "no-store",
    });
  },

  hasRescheduleSlots: (token: string): Promise<RescheduleAvailability> =>
    doFetchJson(`${manageUrl(token)}/has-slots`, { cache: "no-store" }),
};
