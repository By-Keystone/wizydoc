import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { SignOutUseCase } from "../application/sign-out.usecase";
import { CognitoSessionProvider } from "../infrastructure/identity-provider/cognito/cognito-session";
import { handleSignOut } from "./sign-out.http";

const dependencies = {
  signOut: new SignOutUseCase(
    new CognitoSessionProvider(new CognitoIdentityProviderClient({}), {
      userPoolId: requireEnv("USER_POOL_ID"),
      clientId: requireEnv("PLATFORM_CLIENT_ID"),
    }),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleSignOut(event, dependencies);
