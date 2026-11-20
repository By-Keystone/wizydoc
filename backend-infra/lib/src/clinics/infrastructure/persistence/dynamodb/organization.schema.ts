import type { ULID } from "ulid";

type PK = `ORG#${string}`;
type SK = "!";

export const ORGANIZATION_ITEM_TYPE = "ORGANIZATION";

export interface OrganizationDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof ORGANIZATION_ITEM_TYPE;
  Id: ULID;
  AccountId: ULID;
  Name: string;
  GSI1PK: `ACCOUNT#${string}`;
  GSI1SK: PK;
}

export const organizationPk = (id: string): PK => `ORG#${id}`;
export const organizationSk = (): SK => "!";
