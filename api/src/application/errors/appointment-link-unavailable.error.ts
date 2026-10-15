import { NotFound } from "./not-found.error";

export class AppointmentLinkUnavailable extends NotFound {
  constructor() {
    super("Este enlace ya no está disponible.");
  }
}
