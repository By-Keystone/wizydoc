import type { ULID } from "ulid";

type PK = `ACCOUNT#${string}`;
type SK = "!";

export const ACCOUNT_ITEM_TYPE = "ACCOUNT";

export interface AccountDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof ACCOUNT_ITEM_TYPE;
  Id: ULID;
  OwnerUserId: ULID;
}

export const accountPk = (id: string): PK => `ACCOUNT#${id}`;
export const accountSk = (): SK => "!";
