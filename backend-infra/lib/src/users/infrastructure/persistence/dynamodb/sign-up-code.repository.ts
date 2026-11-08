import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ISignUpCodeRepository } from "../../../domain/repository/sign-up-code.repository";
import {
  SIGN_UP_EMAIL_COOLDOWN_SECONDS,
  type SignUpCode,
} from "../../../domain/sign-up-code.entity";
import { toEpochSeconds } from "./epoch-seconds";
import { fromSignUpCodeToDynamo } from "./sign-up-code.mappers";

const ONLY_IF_NOT_REQUESTED_RECENTLY =
  "attribute_not_exists(PK) OR DeleteAfter <= :latestReplaceableExpiry";

export class SignUpCodeRepository implements ISignUpCodeRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
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
}
