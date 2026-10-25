import {
  ApiError,
  AuthExpiredError,
  isPlanFeatureError,
  PLAN_FEATURE_MESSAGE,
} from "@/lib/api/errors";
import type { ActionFailure } from "./types";

const FIRST_SERVER_ERROR_STATUS = 500;

const SERVER_ERROR_MESSAGE =
  "Algo salió mal de nuestro lado. Vuelve a intentarlo en unos minutos.";

/**
 * Convierte un error lanzado por la capa de API en el `ActionState` que
 * consume el frontend. Úsalo en el `catch` de las server actions para no
 * repetir el mapeo de errores en cada una.
 */
export function toActionState(error: unknown): ActionFailure {
  if (error instanceof AuthExpiredError) {
    return { status: "auth-expired" };
  }
  if (isPlanFeatureError(error)) {
    return { status: "error", message: PLAN_FEATURE_MESSAGE };
  }
  if (error instanceof ApiError && error.status < FIRST_SERVER_ERROR_STATUS) {
    return { status: "error", message: error.message, code: error.code };
  }
  // El mensaje de un 5xx (Prisma o pg) o de un Error inesperado no es para el usuario.
  if (error instanceof Error) {
    return { status: "error", message: SERVER_ERROR_MESSAGE };
  }
  return { status: "error", message: "Ha ocurrido un error" };
}
