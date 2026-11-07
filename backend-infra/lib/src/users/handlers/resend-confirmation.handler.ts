import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { ResendConfirmationUseCase } from "../application/resend-confirmation.usecase";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { DynamoDBEmailSendAttempts } from "../infrastructure/persistence/dynamodb/email-send-attempts";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { signUpEmailsFromEnvironment } from "./sign-up-emails-from-environment";
import { handleResendConfirmation } from "./resend-confirmation.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  emailSendAttempts: new DynamoDBEmailSendAttempts(documentClient, tableName),
  resendConfirmation: new ResendConfirmationUseCase(
    new UserRepository(documentClient, tableName),
    signUpEmailsFromEnvironment(),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleResendConfirmation(event, dependencies);
