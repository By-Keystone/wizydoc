import { ApplicationError } from "./application.errors";

export class TooManyRequests extends ApplicationError {
  readonly statusCode = 429;
  readonly code = "TOO_MANY_REQUESTS";
}
