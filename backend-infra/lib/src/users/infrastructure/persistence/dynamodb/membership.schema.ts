import type { ULID } from "ulid";
import type {
  MembershipResourceType,
  MembershipRole,
} from "../../../domain/membership.entity";

export const MEMBERSHIP_ITEM_TYPE = "MEMBERSHIP";

export interface MembershipDynamoDBSchema {
  PK: `USER#${string}`;
  SK: `MEMBERSHIP#${string}`;
  ItemType: typeof MEMBERSHIP_ITEM_TYPE;
  UserId: ULID;
  ResourceId: ULID;
  ResourceType: MembershipResourceType;
  AccountId: ULID;
  Role: MembershipRole;
  Specialties?: string[];
  GSI1PK: `ORG#${string}` | `CLINIC#${string}`;
  GSI1SK: `MEMBER#${string}`;
}
