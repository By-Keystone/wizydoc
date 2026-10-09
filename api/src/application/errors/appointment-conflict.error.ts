import { ApplicationError } from "./application.errors";

export type AppointmentConflictCode =
  | "SLOT_TAKEN"
  | "RESCHEDULE_NOT_ALLOWED"
  | "APPOINTMENT_CHANGED";

export class AppointmentConflict extends ApplicationError {
  readonly statusCode = 409;

  constructor(
    message: string,
    readonly code: AppointmentConflictCode,
  ) {
    super(message);
  }
}
