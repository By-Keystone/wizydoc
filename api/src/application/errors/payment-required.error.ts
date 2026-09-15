import { ApplicationError } from "./application.errors";

/**
 * El plan contratado no alcanza. Se distingue de `Forbidden` porque el cliente
 * sí tiene permiso: lo que falta es capacidad comprada, y el frontend ofrece
 * mejorar el plan en lugar de un error de acceso.
 */
export class PaymentRequired extends ApplicationError {
  readonly statusCode = 402;
  readonly code = "PLAN_LIMIT_REACHED";
}
