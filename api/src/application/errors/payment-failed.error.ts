import { ApplicationError } from "./application.errors";

/**
 * El proveedor de pagos rechazó la operación. Se distingue de `PaymentRequired`
 * porque aquí el cliente sí intentó pagar: el frontend debe decirle que no se
 * realizó ningún cargo y pedirle la tarjeta de nuevo.
 */
export class PaymentFailed extends ApplicationError {
  readonly statusCode = 402;
  readonly code = "PAYMENT_FAILED";
}
