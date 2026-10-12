import { ApiError } from "@/lib/api/errors";
import type {
  ManagedAppointment,
  ManagedAppointmentConflict,
} from "@/lib/api/appointments/types";

export type ManageAppointmentResult =
  | { status: "success"; appointment: ManagedAppointment }
  | {
      status: "error";
      message: string;
      httpStatus?: number;
      conflict?: ManagedAppointmentConflict;
    };

const CONFLICT_CODES: readonly string[] = [
  "SLOT_TAKEN",
  "RESCHEDULE_NOT_ALLOWED",
  "APPOINTMENT_CHANGED",
];

export function toManageAppointmentError(
  error: unknown,
): ManageAppointmentResult {
  if (error instanceof ApiError) {
    return {
      status: "error",
      message: error.message,
      httpStatus: error.status,
      conflict:
        error.code && CONFLICT_CODES.includes(error.code)
          ? (error.code as ManagedAppointmentConflict)
          : undefined,
    };
  }
  return { status: "error", message: "Ha ocurrido un error" };
}

export const LINK_UNAVAILABLE_RESULT: ManageAppointmentResult = {
  status: "error",
  message: "Este enlace ya no está disponible.",
  httpStatus: 404,
};
