import { SESv2Client } from "@aws-sdk/client-sesv2";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { ResendConfirmationUseCase } from "../application/resend-confirmation.usecase";
import { SesSignUpEmails } from "../infrastructure/email/ses/sign-up-emails";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { DynamoDBEmailSendAttempts } from "../infrastructure/persistence/dynamodb/email-send-attempts";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleResendConfirmation } from "./resend-confirmation.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  emailSendAttempts: new DynamoDBEmailSendAttempts(documentClient, tableName),
  resendConfirmation: new ResendConfirmationUseCase(
    new UserRepository(documentClient, tableName),
    new SesSignUpEmails(new SESv2Client({}), {
      fromAddress: requireEnv("EMAIL_FROM"),
      frontendUrl: requireEnv("FRONTEND_URL"),
    }),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleResendConfirmation(event, dependencies);
