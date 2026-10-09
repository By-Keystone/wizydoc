import { ApplicationError } from "./application.errors";

export class Gone extends ApplicationError {
  readonly statusCode = 410;
  readonly code = "GONE";
}
