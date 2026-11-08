import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { RequestSignUpCodeUseCase } from "../application/request-sign-up-code.usecase";
import { DynamoDBAccountExistsNotices } from "../infrastructure/persistence/dynamodb/account-exists-notices";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import { DynamoDBEmailSendAttempts } from "../infrastructure/persistence/dynamodb/email-send-attempts";
import { SignUpCodeRepository } from "../infrastructure/persistence/dynamodb/sign-up-code.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleRequestSignUpCode } from "./request-sign-up-code.http";
import { signUpEmailsFromEnvironment } from "./sign-up-emails-from-environment";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  emailSendAttempts: new DynamoDBEmailSendAttempts(documentClient, tableName),
  requestSignUpCode: new RequestSignUpCodeUseCase(
    new UserRepository(documentClient, tableName),
    new SignUpCodeRepository(documentClient, tableName),
    new DynamoDBAccountExistsNotices(documentClient, tableName),
    signUpEmailsFromEnvironment(),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleRequestSignUpCode(event, dependencies);
