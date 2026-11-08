import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import {
  ConfirmSignUpUseCase,
  confirmSignUpInputSchemaFor,
} from "../application/confirm-sign-up.usecase";
import { CognitoIdentityProvider } from "../infrastructure/identity-provider/cognito/cognito";
import { CognitoSessionProvider } from "../infrastructure/identity-provider/cognito/cognito-session";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { SignUpVerificationTokenRepository } from "../infrastructure/persistence/dynamodb/sign-up-verification-token.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleConfirmSignUp } from "./confirm-sign-up.http";

const tableName = requireEnv("TABLE_NAME");
const userPoolId = requireEnv("USER_POOL_ID");
const requireTermsAcceptance = process.env.TERMS_ACCEPTANCE_REQUIRED === "true";
const documentClient = getClient();
const cognitoClient = new CognitoIdentityProviderClient({});

const dependencies = {
  inputSchema: confirmSignUpInputSchemaFor(requireTermsAcceptance),
  confirmSignUp: new ConfirmSignUpUseCase(
    new SignUpVerificationTokenRepository(documentClient, tableName),
    new UserRepository(documentClient, tableName),
    new CognitoIdentityProvider(cognitoClient, userPoolId),
    new CognitoSessionProvider(cognitoClient, {
      userPoolId,
      clientId: requireEnv("PLATFORM_CLIENT_ID"),
    }),
    requireTermsAcceptance,
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleConfirmSignUp(event, dependencies);
