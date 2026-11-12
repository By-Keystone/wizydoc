import type { ULID } from "ulid";
import { z } from "zod";

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

export const accountItemSchema = z.object({
  Id: z.ulid(),
  OwnerUserId: z.ulid(),
});

export const accountPk = (id: string): PK => `ACCOUNT#${id}`;
export const accountSk = (): SK => "!";
