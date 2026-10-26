import { ApplicationError } from "./application.errors";

// 409 y no 402: el paciente nunca debe ver mensajes de plan.
export class BookingClosed extends ApplicationError {
  readonly statusCode = 409;
  readonly code = "BOOKING_CLOSED";

  constructor() {
    super("Este consultorio no está recibiendo reservas en línea por ahora");
  }
}
