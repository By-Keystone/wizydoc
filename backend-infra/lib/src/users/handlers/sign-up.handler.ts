import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import {
  SignUpUseCase,
  signUpInputSchemaFor,
} from "../application/sign-up.usecase";
import { CognitoIdentityProvider } from "../infrastructure/identity-provider/cognito/cognito";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import {
  DynamoDBIpRateLimit,
  EMAIL_SEND_RATE_LIMIT,
} from "../infrastructure/persistence/dynamodb/ip-rate-limit";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { signUpEmailsFromEnvironment } from "./sign-up-emails-from-environment";
import { handleSignUp } from "./sign-up.http";

const tableName = requireEnv("TABLE_NAME");
const requireTermsAcceptance = process.env.TERMS_ACCEPTANCE_REQUIRED === "true";
const documentClient = getClient();

const dependencies = {
  inputSchema: signUpInputSchemaFor(requireTermsAcceptance),
  emailSendAttempts: new DynamoDBIpRateLimit(
    documentClient,
    tableName,
    EMAIL_SEND_RATE_LIMIT,
  ),
  signUp: new SignUpUseCase(
    new UserRepository(documentClient, tableName),
    new CognitoIdentityProvider(
      new CognitoIdentityProviderClient({}),
      requireEnv("USER_POOL_ID"),
    ),
    signUpEmailsFromEnvironment(),
    requireTermsAcceptance,
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleSignUp(event, dependencies);
