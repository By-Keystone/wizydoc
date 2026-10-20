import { ApplicationError } from "./application.errors";

export class OwnSpecialties extends ApplicationError {
  readonly statusCode = 403;
  readonly code = "OWN_SPECIALTIES";

  constructor() {
    super("Tus especialidades se editan en «Mi perfil».");
  }
}
