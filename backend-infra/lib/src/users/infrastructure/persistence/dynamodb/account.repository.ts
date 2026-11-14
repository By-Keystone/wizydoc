import { type DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Account } from "../../../domain/account.entity";
import type { IAccountRepository } from "../../../domain/repository/account.repository";
import { fromDynamoToAccount } from "./account.mappers";
import { ACCOUNT_ITEM_TYPE, accountPk, accountSk } from "./account.schema";

export class AccountRepository implements IAccountRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findById(accountId: string): Promise<Account | undefined> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: accountPk(accountId), SK: accountSk() },
        ProjectionExpression: "ItemType, Id, OwnerUserId",
        ConsistentRead: true,
      }),
    );

    if (Item?.ItemType !== ACCOUNT_ITEM_TYPE) return undefined;
    return fromDynamoToAccount(Item);
  }
}
