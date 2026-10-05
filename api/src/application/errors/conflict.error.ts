import { ApplicationError } from "./application.errors";

export class Conflict extends ApplicationError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}
