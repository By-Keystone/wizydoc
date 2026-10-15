import { ApplicationError } from "./application.errors";

export const APPOINTMENT_CHANGED_MESSAGE =
  "Tu cita cambió mientras elegías. Alguien canceló o reprogramó esta cita desde otra pestaña o dispositivo. Recarga para ver cómo quedó.";
export const LESS_THAN_NOTICE_MESSAGE =
  "Ya no puedes cambiar esta cita desde este enlace porque faltan menos de 12 horas.";
export const ALREADY_RESCHEDULED_MESSAGE =
  "Esta cita ya se reprogramó una vez y no se puede volver a reprogramar. Si necesitas otro horario, cancélala y reserva de nuevo.";

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
