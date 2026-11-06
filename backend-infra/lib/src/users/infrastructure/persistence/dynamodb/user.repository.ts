import {
  type DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ConfirmationToken } from "../../../domain/confirmation-token.entity";
import type { IUserRepository } from "../../../domain/repository/user.repository";
import type { TermsAcceptance } from "../../../domain/terms-acceptance.entity";
import type { User } from "../../../domain/user.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import { fromConfirmationTokenToDynamo } from "./confirmation-token.mappers";
import { fromTermsAcceptanceToDynamo } from "./terms-acceptance.mappers";
import { fromDomainToDynamo, fromDynamoToDomain } from "./user.mappers";
import {
  gsi1pk,
  USER_ITEM_TYPE,
  type UsersDynamoDBSchema,
} from "./user.schema";

const ONLY_IF_NEW = "attribute_not_exists(PK)";

export class UserRepository implements IUserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(
    user: User,
    confirmationToken: ConfirmationToken,
    termsAcceptance?: TermsAcceptance,
  ): Promise<void> {
    const recordsToCreate = [
      fromDomainToDynamo(user),
      fromConfirmationTokenToDynamo(confirmationToken),
      ...(termsAcceptance
        ? [fromTermsAcceptanceToDynamo(termsAcceptance)]
        : []),
    ];

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: recordsToCreate.map((record) => ({
          Put: {
            TableName: this.tableName,
            Item: record,
            ConditionExpression: ONLY_IF_NEW,
          },
        })),
      }),
    );
  }

  async saveConfirmationToken(
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: fromConfirmationTokenToDynamo(confirmationToken),
        ConditionExpression: ONLY_IF_NEW,
      }),
    );
  }

  async findByEmail(email: EmailVO): Promise<User | undefined> {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "#GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": gsi1pk(email),
        },
        ExpressionAttributeNames: {
          "#GSI1PK": "GSI1PK",
        },
        Limit: 1,
      }),
    );

    const [userRecord] = Items ?? [];

    return userRecord?.ItemType === USER_ITEM_TYPE
      ? fromDynamoToDomain(userRecord as UsersDynamoDBSchema)
      : undefined;
  }
}
