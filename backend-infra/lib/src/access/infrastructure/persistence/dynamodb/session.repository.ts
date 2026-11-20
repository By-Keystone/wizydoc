import {
  type DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { fromDynamoToMembership } from "../../../../clinics/infrastructure/persistence/dynamodb/membership.mappers";
import {
  MEMBERSHIP_ITEM_TYPE,
  type MembershipDynamoDBSchema,
} from "../../../../clinics/infrastructure/persistence/dynamodb/membership.schema";
import { fromDynamoToDomain } from "../../../../users/infrastructure/persistence/dynamodb/user.mappers";
import {
  gsi2pk,
  pk,
  USER_ITEM_TYPE,
  type UsersDynamoDBSchema,
} from "../../../../users/infrastructure/persistence/dynamodb/user.schema";
import type {
  ISessionRepository,
  UserWithMemberships,
} from "../../../domain/repository/session.repository";

const PARTITION_READ_ATTRIBUTES = [
  "ItemType",
  "Id",
  "Email",
  "Confirmed",
  "AccountId",
  "OnboardingStep",
  "CognitoSub",
  "ResourceId",
  "ResourceType",
  "Role",
];

type SessionPartitionItem =
  | Pick<
      UsersDynamoDBSchema,
      | "ItemType"
      | "Id"
      | "Email"
      | "Confirmed"
      | "AccountId"
      | "OnboardingStep"
      | "CognitoSub"
    >
  | Pick<
      MembershipDynamoDBSchema,
      "ItemType" | "ResourceId" | "ResourceType" | "AccountId" | "Role"
    >;

export class SessionRepository implements ISessionRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findByCognitoSubWithMemberships(
    cognitoSub: string,
  ): Promise<UserWithMemberships | undefined> {
    const userId = await this.findUserIdByCognitoSub(cognitoSub);
    if (!userId) return undefined;

    const partition: SessionPartitionItem[] = [];
    let startKey: QueryCommandOutput["LastEvaluatedKey"];
    do {
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
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      partition.push(...(Items as SessionPartitionItem[]));
      startKey = LastEvaluatedKey;
    } while (startKey);

    const userItem = partition.find((item) => item.ItemType === USER_ITEM_TYPE);
    if (!userItem || userItem.CognitoSub !== cognitoSub) return undefined;

    return {
      user: fromDynamoToDomain(userItem),
      memberships: partition
        .filter((item) => item.ItemType === MEMBERSHIP_ITEM_TYPE)
        .map(fromDynamoToMembership),
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
        Limit: 1,
      }),
    );

    const [indexItem] = (Items ?? []) as Pick<
      UsersDynamoDBSchema,
      "ItemType" | "Id"
    >[];
    return indexItem?.ItemType === USER_ITEM_TYPE ? indexItem.Id : undefined;
  }
}
