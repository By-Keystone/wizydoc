import { SESv2Client } from "@aws-sdk/client-sesv2";
import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { RequestSignUpCodeUseCase } from "../application/request-sign-up-code.usecase";
import { DynamoDBAccountExistsNotices } from "../infrastructure/persistence/dynamodb/account-exists-notices";
import { SesSignUpEmails } from "../infrastructure/email/ses/sign-up-emails";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import {
  DynamoDBIpRateLimit,
  EMAIL_SEND_RATE_LIMIT,
} from "../infrastructure/persistence/dynamodb/ip-rate-limit";
import { SignUpCodeRepository } from "../infrastructure/persistence/dynamodb/sign-up-code.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleRequestSignUpCode } from "./request-sign-up-code.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  emailSendAttempts: new DynamoDBIpRateLimit(
    documentClient,
    tableName,
    EMAIL_SEND_RATE_LIMIT,
  ),
  requestSignUpCode: new RequestSignUpCodeUseCase(
    new UserRepository(documentClient, tableName),
    new SignUpCodeRepository(documentClient, tableName),
    new DynamoDBAccountExistsNotices(documentClient, tableName),
    new SesSignUpEmails(new SESv2Client({}), {
      fromAddress: requireEnv("EMAIL_FROM"),
      frontendUrl: requireEnv("FRONTEND_URL"),
      templates: {
        accountExists: requireEnv("ACCOUNT_EXISTS_TEMPLATE"),
        signUpCode: requireEnv("SIGN_UP_CODE_TEMPLATE"),
      },
    }),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleRequestSignUpCode(event, dependencies);
