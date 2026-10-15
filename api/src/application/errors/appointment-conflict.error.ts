import { ApplicationError } from "./application.errors";

export type AppointmentConflictCode =
  | "SLOT_TAKEN"
  | "APPOINTMENT_CHANGED"
  | "CANCEL_NOT_ALLOWED"
  | "RESCHEDULE_NOT_ALLOWED"
  | "DOCTOR_CHANGE_NOT_ALLOWED";

export class AppointmentConflict extends ApplicationError {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: AppointmentConflictCode,
  ) {
    super(message);
  }
}
