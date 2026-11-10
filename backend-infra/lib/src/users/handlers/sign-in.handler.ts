import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { SignInUseCase } from "../application/sign-in.usecase";
import { CognitoSessionProvider } from "../infrastructure/identity-provider/cognito/cognito-session";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import {
  DynamoDBIpRateLimit,
  SIGN_IN_RATE_LIMIT,
} from "../infrastructure/persistence/dynamodb/ip-rate-limit";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleSignIn } from "./sign-in.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  signInRateLimit: new DynamoDBIpRateLimit(
    documentClient,
    tableName,
    SIGN_IN_RATE_LIMIT,
  ),
  signIn: new SignInUseCase(
    new CognitoSessionProvider(new CognitoIdentityProviderClient({}), {
      userPoolId: requireEnv("USER_POOL_ID"),
      clientId: requireEnv("PLATFORM_CLIENT_ID"),
    }),
    new UserRepository(documentClient, tableName),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleSignIn(event, dependencies);
