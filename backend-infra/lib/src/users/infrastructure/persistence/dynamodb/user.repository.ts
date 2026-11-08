import {
  type DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  IUserRepository,
  VerificationToCommit,
} from "../../../domain/repository/user.repository";
import type { TermsAcceptance } from "../../../domain/terms-acceptance.entity";
import type { User } from "../../../domain/user.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import { isLostRace } from "./lost-race";
import {
  signUpVerificationTokenPk,
  signUpVerificationTokenSk,
} from "./sign-up-verification-token.schema";
import { fromTermsAcceptanceToDynamo } from "./terms-acceptance.mappers";
import { fromDomainToDynamo } from "./user.mappers";
import { gsi1pk, USER_ITEM_TYPE } from "./user.schema";

const ONLY_IF_NEW = "attribute_not_exists(PK)";
const ONLY_IF_VERIFICATION_IS_VALID =
  "attribute_exists(PK) AND Email = :email AND DeleteAfter > :now";

export class UserRepository implements IUserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async createConfirmed(
    user: User,
    { email, tokenHash }: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean> {
    const recordsToCreate = [
      fromDomainToDynamo(user),
      ...(termsAcceptance
        ? [fromTermsAcceptanceToDynamo(termsAcceptance)]
        : []),
    ];

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            ...recordsToCreate.map((record) => ({
              Put: {
                TableName: this.tableName,
                Item: record,
                ConditionExpression: ONLY_IF_NEW,
              },
            })),
            {
              Delete: {
                TableName: this.tableName,
                Key: {
                  PK: signUpVerificationTokenPk(tokenHash),
                  SK: signUpVerificationTokenSk(),
                },
                ConditionExpression: ONLY_IF_VERIFICATION_IS_VALID,
                ExpressionAttributeValues: {
                  ":email": email,
                  ":now": Math.floor(this.nowInMilliseconds() / 1000),
                },
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

  async existsByEmail(email: EmailVO): Promise<boolean> {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "#GSI1PK = :gsi1pk",
        ProjectionExpression: "#ItemType",
        ExpressionAttributeValues: { ":gsi1pk": gsi1pk(email) },
        ExpressionAttributeNames: {
          "#GSI1PK": "GSI1PK",
          "#ItemType": "ItemType",
        },
        Limit: 1,
      }),
    );

    return Items?.[0]?.ItemType === USER_ITEM_TYPE;
  }
}
