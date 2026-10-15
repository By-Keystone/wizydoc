import {
  ApiError,
  AuthExpiredError,
  isPlanFeatureError,
  PLAN_FEATURE_MESSAGE,
} from "@/lib/api/errors";
import type { ActionFailure } from "./types";

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
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Ha ocurrido un error" };
}
