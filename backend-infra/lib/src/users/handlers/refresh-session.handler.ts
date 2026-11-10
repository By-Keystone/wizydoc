import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { RefreshSessionUseCase } from "../application/refresh-session.usecase";
import { CognitoSessionProvider } from "../infrastructure/identity-provider/cognito/cognito-session";
import { handleRefreshSession } from "./refresh-session.http";

const dependencies = {
  refreshSession: new RefreshSessionUseCase(
    new CognitoSessionProvider(new CognitoIdentityProviderClient({}), {
      userPoolId: requireEnv("USER_POOL_ID"),
      clientId: requireEnv("PLATFORM_CLIENT_ID"),
    }),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleRefreshSession(event, dependencies);
