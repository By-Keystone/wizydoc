import type { ULID } from "ulid";
import { z } from "zod";

type PK = `CLINIC#${string}`;
type SK = "!";

export const CLINIC_ITEM_TYPE = "CLINIC";

export interface ClinicDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof CLINIC_ITEM_TYPE;
  Id: ULID;
  AccountId: ULID;
  OrganizationId: ULID;
  Name: string;
  Address: string;
  GSI1PK: `ORG#${string}`;
  GSI1SK: PK;
  GSI2PK: `ACCOUNT#${string}`;
  GSI2SK: PK;
}

export const clinicItemSchema = z.object({ OrganizationId: z.ulid() });

export const clinicPk = (id: string): PK => `CLINIC#${id}`;
export const clinicSk = (): SK => "!";
