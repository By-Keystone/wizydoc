import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { RequestSignUpCodeUseCase } from "../application/request-sign-up-code.usecase";
import { DynamoDBAccountExistsNotices } from "../infrastructure/persistence/dynamodb/account-exists-notices";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import {
  DynamoDBIpRateLimit,
  EMAIL_SEND_RATE_LIMIT,
} from "../infrastructure/persistence/dynamodb/ip-rate-limit";
import { SignUpCodeRepository } from "../infrastructure/persistence/dynamodb/sign-up-code.repository";
import { UserRepository } from "../infrastructure/persistence/dynamodb/user.repository";
import { handleRequestSignUpCode } from "./request-sign-up-code.http";
import { signUpEmailsFromEnvironment } from "./sign-up-emails-from-environment";

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
    signUpEmailsFromEnvironment(),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleRequestSignUpCode(event, dependencies);
