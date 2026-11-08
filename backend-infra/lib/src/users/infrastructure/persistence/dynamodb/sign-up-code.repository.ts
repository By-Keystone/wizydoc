import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
  TransactionConflictException,
} from "@aws-sdk/client-dynamodb";
import {
  type DynamoDBDocumentClient,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ISignUpCodeRepository } from "../../../domain/repository/sign-up-code.repository";
import {
  SIGN_UP_CODE_MAX_ATTEMPTS,
  SIGN_UP_EMAIL_COOLDOWN_SECONDS,
  type SignUpCode,
} from "../../../domain/sign-up-code.entity";
import type { SignUpVerificationToken } from "../../../domain/sign-up-verification-token.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import { toEpochSeconds } from "./epoch-seconds";
import { fromSignUpCodeToDynamo } from "./sign-up-code.mappers";
import { signUpCodePk, signUpCodeSk } from "./sign-up-code.schema";
import { fromSignUpVerificationTokenToDynamo } from "./sign-up-verification-token.mappers";

const ONLY_IF_NOT_REQUESTED_RECENTLY =
  "attribute_not_exists(PK) OR DeleteAfter <= :latestReplaceableExpiry";

const LOST_RACE_REASONS = [
  "ConditionalCheckFailed",
  "TransactionConflict",
  "None",
];

const isOnlyLostRaceReasons = (reasons: { Code?: string }[]): boolean =>
  reasons.length > 0 &&
  reasons.every(({ Code }) => LOST_RACE_REASONS.includes(Code ?? "None"));

const isLostRace = (error: unknown): boolean =>
  error instanceof ConditionalCheckFailedException ||
  error instanceof TransactionConflictException ||
  (error instanceof TransactionCanceledException &&
    isOnlyLostRaceReasons(error.CancellationReasons ?? []));

export class SignUpCodeRepository implements ISignUpCodeRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async saveUnlessRequestedRecently(signUpCode: SignUpCode): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: fromSignUpCodeToDynamo(signUpCode),
          ConditionExpression: ONLY_IF_NOT_REQUESTED_RECENTLY,
          ExpressionAttributeValues: {
            ":latestReplaceableExpiry":
              toEpochSeconds(signUpCode.expiresAt) -
              SIGN_UP_EMAIL_COOLDOWN_SECONDS,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  async registerAttemptAndReadCodeHash(
    email: EmailVO,
  ): Promise<string | undefined> {
    try {
      const { Attributes } = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: this.codeKey(email),
          UpdateExpression: "ADD Attempts :one",
          ConditionExpression:
            "attribute_exists(PK) AND Attempts < :maxAttempts AND DeleteAfter > :now",
          ExpressionAttributeValues: {
            ":one": 1,
            ":maxAttempts": SIGN_UP_CODE_MAX_ATTEMPTS,
            ":now": Math.floor(this.nowInMilliseconds() / 1000),
          },
          ReturnValues: "ALL_NEW",
        }),
      );
      return Attributes?.CodeHash;
    } catch (error) {
      if (isLostRace(error)) return undefined;
      throw error;
    }
  }

  async spendForVerificationToken(
    email: EmailVO,
    codeHash: string,
    verificationToken: SignUpVerificationToken,
  ): Promise<boolean> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: this.tableName,
                Key: this.codeKey(email),
                ConditionExpression: "CodeHash = :codeHash",
                ExpressionAttributeValues: { ":codeHash": codeHash },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: fromSignUpVerificationTokenToDynamo(verificationToken),
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (isLostRace(error)) return false;
      throw error;
    }
  }

  private codeKey(email: EmailVO) {
    return { PK: signUpCodePk(email), SK: signUpCodeSk() };
  }
}
