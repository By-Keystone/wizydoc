import {
  type DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Account } from "../../../domain/account.entity";
import type {
  IUserRepository,
  UserWithMemberships,
  VerificationToCommit,
} from "../../../domain/repository/user.repository";
import type { TermsAcceptance } from "../../../domain/terms-acceptance.entity";
import type { User } from "../../../domain/user.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import { fromAccountToDynamo } from "./account.mappers";
import { isLostRace } from "./lost-race";
import { fromDynamoToMembership } from "./membership.mappers";
import { MEMBERSHIP_ITEM_TYPE } from "./membership.schema";
import {
  signUpVerificationTokenPk,
  signUpVerificationTokenSk,
} from "./sign-up-verification-token.schema";
import { fromTermsAcceptanceToDynamo } from "./terms-acceptance.mappers";
import { fromDomainToDynamo, fromDynamoToDomain } from "./user.mappers";
import {
  gsi1pk,
  gsi2pk,
  pk,
  USER_ITEM_TYPE,
  userIdSchema,
} from "./user.schema";

export const ONLY_IF_NEW = "attribute_not_exists(PK)";
const ONLY_IF_VERIFICATION_IS_VALID =
  "attribute_exists(PK) AND Email = :email AND DeleteAfter > :now";

const PARTITION_READ_ATTRIBUTES = [
  "ItemType",
  "Id",
  "Email",
  "Confirmed",
  "AccountId",
  "OnboardingStep",
  "CognitoSub",
  "GivenName",
  "FamilyName",
  "Phone",
  "Treatment",
  "ResourceId",
  "ResourceType",
  "Role",
];

export class UserRepository implements IUserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async createConfirmed(
    user: User,
    account: Account,
    { email, tokenHash }: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean> {
    const recordsToCreate = [
      fromDomainToDynamo(user),
      fromAccountToDynamo(account),
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

  async isConfirmed(cognitoSub: string): Promise<boolean> {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "#GSI2PK = :gsi2pk",
        ProjectionExpression: "#ItemType, #Confirmed",
        ExpressionAttributeValues: { ":gsi2pk": gsi2pk(cognitoSub) },
        ExpressionAttributeNames: {
          "#GSI2PK": "GSI2PK",
          "#ItemType": "ItemType",
          "#Confirmed": "Confirmed",
        },
        Limit: 1,
      }),
    );

    return (
      Items?.[0]?.ItemType === USER_ITEM_TYPE && Items[0].Confirmed === true
    );
  }

  async findByCognitoSubWithMemberships(
    cognitoSub: string,
  ): Promise<UserWithMemberships | undefined> {
    const userId = await this.findUserIdByCognitoSub(cognitoSub);
    if (!userId) return undefined;

    const { Items = [], LastEvaluatedKey } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "#PK = :pk",
        FilterExpression: "#ItemType IN (:user, :membership)",
        ProjectionExpression: PARTITION_READ_ATTRIBUTES.map(
          (name) => `#${name}`,
        ).join(", "),
        ExpressionAttributeValues: {
          ":pk": pk(userId),
          ":user": USER_ITEM_TYPE,
          ":membership": MEMBERSHIP_ITEM_TYPE,
        },
        ExpressionAttributeNames: Object.fromEntries([
          ["#PK", "PK"],
          ...PARTITION_READ_ATTRIBUTES.map((name) => [`#${name}`, name]),
        ]),
        ConsistentRead: true,
      }),
    );
    if (LastEvaluatedKey)
      throw new Error("La partición del usuario no cabe en una sola lectura");

    const userItem = Items.find((item) => item.ItemType === USER_ITEM_TYPE);
    if (!userItem || userItem.CognitoSub !== cognitoSub) return undefined;

    return {
      user: fromDynamoToDomain(userItem),
      memberships: Items.filter(
        (item) => item.ItemType === MEMBERSHIP_ITEM_TYPE,
      ).map(fromDynamoToMembership),
    };
  }

  private async findUserIdByCognitoSub(
    cognitoSub: string,
  ): Promise<string | undefined> {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "#GSI2PK = :gsi2pk",
        ProjectionExpression: "#ItemType, #Id",
        ExpressionAttributeValues: { ":gsi2pk": gsi2pk(cognitoSub) },
        ExpressionAttributeNames: {
          "#GSI2PK": "GSI2PK",
          "#ItemType": "ItemType",
          "#Id": "Id",
        },
        Limit: 2,
      }),
    );

    const userItems = (Items ?? []).filter(
      (item) => item.ItemType === USER_ITEM_TYPE,
    );
    if (userItems.length > 1) {
      throw new Error("Hay más de un usuario con el mismo sub");
    }
    return userItems.length ? userIdSchema.parse(userItems[0].Id) : undefined;
  }
}
