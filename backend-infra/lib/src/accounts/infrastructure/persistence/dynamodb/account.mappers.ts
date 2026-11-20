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
});

export const fromDynamoToAccount = ({
  Id,
  OwnerUserId,
}: Pick<AccountDynamoDBSchema, "Id" | "OwnerUserId">): Account => ({
  id: Id,
  ownerUserId: OwnerUserId,
});
