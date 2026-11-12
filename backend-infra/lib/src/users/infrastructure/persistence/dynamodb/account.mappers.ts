import type { Account } from "../../../domain/account.entity";
import {
  ACCOUNT_ITEM_TYPE,
  type AccountDynamoDBSchema,
  accountPk,
  accountSk,
} from "./account.schema";

export const fromAccountToDynamo = (
  account: Account,
): AccountDynamoDBSchema => ({
  PK: accountPk(account.id),
  SK: accountSk(),
  ItemType: ACCOUNT_ITEM_TYPE,
  Id: account.id,
  OwnerUserId: account.ownerUserId,
  CreatedAt: account.createdAt.toISOString(),
});
