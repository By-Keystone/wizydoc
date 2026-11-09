import { errorName } from "../../shared/errors";
import {
  type ApiGatewayEvent,
  type ApiGatewayResult,
  HTTP_STATUS,
  messageResponse,
  noStoreJsonResponse,
  parseJsonBody,
} from "../../shared/http/api-gateway";
import { INVALID_REQUEST } from "../../shared/messages";
import {
  type RefreshSessionUseCase,
  refreshSessionInputSchema,
} from "../application/refresh-session.usecase";
import { SESSION_EXPIRED, SESSION_REFRESH_FAILED } from "./http-messages";

export interface RefreshSessionHttpDependencies {
  refreshSession: Pick<RefreshSessionUseCase, "execute">;
}

export const handleRefreshSession = async (
  event: ApiGatewayEvent,
  { refreshSession }: RefreshSessionHttpDependencies,
): Promise<ApiGatewayResult> => {
  const parsed = refreshSessionInputSchema.safeParse(parseJsonBody(event.body));
  if (!parsed.success) {
    return messageResponse(HTTP_STATUS.BAD_REQUEST, INVALID_REQUEST);
  }

  try {
    const session = await refreshSession.execute(parsed.data);
    return session
      ? noStoreJsonResponse(session)
      : messageResponse(HTTP_STATUS.UNAUTHORIZED, SESSION_EXPIRED);
  } catch (error) {
    console.error("[refresh-session] falló la renovación:", errorName(error));
    return messageResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      SESSION_REFRESH_FAILED,
    );
  }
};
