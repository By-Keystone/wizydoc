import { requireEnv } from "../../shared/env";
import type { ApiGatewayEvent } from "../../shared/http/api-gateway";
import { VerifySignUpCodeUseCase } from "../application/verify-sign-up-code.usecase";
import { getClient } from "../infrastructure/persistence/dynamodb/client";
import {
  DynamoDBIpRateLimit,
  SIGN_UP_VERIFY_RATE_LIMIT,
} from "../infrastructure/persistence/dynamodb/ip-rate-limit";
import { SignUpCodeRepository } from "../infrastructure/persistence/dynamodb/sign-up-code.repository";
import { handleVerifySignUpCode } from "./verify-sign-up-code.http";

const tableName = requireEnv("TABLE_NAME");
const documentClient = getClient();

const dependencies = {
  verificationRateLimit: new DynamoDBIpRateLimit(
    documentClient,
    tableName,
    SIGN_UP_VERIFY_RATE_LIMIT,
  ),
  verifySignUpCode: new VerifySignUpCodeUseCase(
    new SignUpCodeRepository(documentClient, tableName),
  ),
};

export const handler = (event: ApiGatewayEvent) =>
  handleVerifySignUpCode(event, dependencies);
