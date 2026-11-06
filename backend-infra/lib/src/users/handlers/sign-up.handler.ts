import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import {
  SignUpUseCase,
  signUpInputSchemaFor,
} from "../application/sign-up.usecase";
import { SesSignUpEmails } from "../infrastructure/email/ses/sign-up-emails";
import { CognitoIdentityProvider } from "../infrastructure/identity-provider/cognito/cognito";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { DynamoDBEmailSendAttempts } from "../infrastructure/persistence/dynamodb/email-send-attempts";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleSignUp } from "./sign-up.http";

const tableName = requireEnv("TABLE_NAME");
const requireTermsAcceptance = process.env.TERMS_ACCEPTANCE_REQUIRED === "true";
const documentClient = getClient();

const dependencies = {
  inputSchema: signUpInputSchemaFor(requireTermsAcceptance),
  emailSendAttempts: new DynamoDBEmailSendAttempts(documentClient, tableName),
  signUp: new SignUpUseCase(
    new UserRepository(documentClient, tableName),
    new CognitoIdentityProvider(
      new CognitoIdentityProviderClient({}),
      requireEnv("USER_POOL_ID"),
    ),
    new SesSignUpEmails(new SESv2Client({}), {
      fromAddress: requireEnv("EMAIL_FROM"),
      frontendUrl: requireEnv("FRONTEND_URL"),
    }),
    requireTermsAcceptance,
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleSignUp(event, dependencies);
