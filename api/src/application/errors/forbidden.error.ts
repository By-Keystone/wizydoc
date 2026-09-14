import { ApplicationError } from "./application.errors";

export class Forbidden extends ApplicationError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";
}
