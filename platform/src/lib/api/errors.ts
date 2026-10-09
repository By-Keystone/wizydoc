/**
 * Error base de la capa de API. Todo cliente de `lib/api` lanza un `ApiError`
 * (o una subclase) ante un fallo, nunca devuelve la `Response` cruda ni se
 * traga el error. El borde correspondiente lo convierte en feedback:
 * server component → `error.tsx`; server action → `toActionState`; cliente →
 * `toast`.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message = "Error en la API", code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class AuthExpiredError extends ApiError {
  constructor(message = "Session expired") {
    super(401, message);
    this.name = "AuthExpiredError";
  }
}

export class NoMembershipError extends ApiError {
  constructor(message = "No memberships found for the user") {
    super(404, message);
    this.name = "NoMembershipError";
  }
}
