import { errorName } from "../../shared/errors";
import { requireEnv } from "../../shared/env";
import {
  type ApiGatewayResult,
  HTTP_STATUS,
  jsonResponse,
  messageResponse,
  type PrivateApiGatewayEvent,
} from "../../shared/http/api-gateway";
import {
  type AuthorizedRequest,
  type AuthorizeRequestUseCase,
  RESOURCE_ID_PARAMETER,
  ROUTE_POLICY_VARIABLE,
  type RoutePolicy,
  routePolicySchema,
} from "../application/authorize-request.usecase";
import {
  EMAIL_NOT_CONFIRMED,
  ONBOARDING_INCOMPLETE,
  REQUEST_FAILED,
  RESOURCE_NOT_FOUND,
  ROLE_FORBIDDEN,
  SESSION_EXPIRED,
} from "./http-messages";

export const readRoutePolicy = (): RoutePolicy =>
  routePolicySchema.parse(JSON.parse(requireEnv(ROUTE_POLICY_VARIABLE)));

const readCognitoSub = (event: PrivateApiGatewayEvent): string | undefined => {
  const sub = event.requestContext?.authorizer?.claims?.sub;
  return typeof sub === "string" && sub !== "" ? sub : undefined;
};

export const handlePrivateRoute = async (
  event: PrivateApiGatewayEvent,
  authorizeRequest: Pick<AuthorizeRequestUseCase, "execute">,
  respond: (authorized: AuthorizedRequest) => Promise<ApiGatewayResult>,
): Promise<ApiGatewayResult> => {
  const cognitoSub = readCognitoSub(event);
  if (!cognitoSub) {
    return messageResponse(HTTP_STATUS.UNAUTHORIZED, SESSION_EXPIRED);
  }

  try {
    const outcome = await authorizeRequest.execute({
      cognitoSub,
      resourceId: event.pathParameters?.[RESOURCE_ID_PARAMETER],
    });

    switch (outcome.kind) {
      case "session-expired":
        return messageResponse(HTTP_STATUS.UNAUTHORIZED, SESSION_EXPIRED);
      case "email-not-confirmed":
        return messageResponse(HTTP_STATUS.FORBIDDEN, EMAIL_NOT_CONFIRMED);
      case "wrong-onboarding-step":
        return jsonResponse(HTTP_STATUS.FORBIDDEN, {
          message: ONBOARDING_INCOMPLETE,
          onboardingStep: outcome.onboardingStep,
        });
      case "resource-not-found":
        return messageResponse(HTTP_STATUS.NOT_FOUND, RESOURCE_NOT_FOUND);
      case "role-forbidden":
        return messageResponse(HTTP_STATUS.FORBIDDEN, ROLE_FORBIDDEN);
      case "authorized":
        return await respond(outcome);
    }
  } catch (error) {
    console.error("[private-route] falló la solicitud:", errorName(error));
    return messageResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, REQUEST_FAILED);
  }
};
