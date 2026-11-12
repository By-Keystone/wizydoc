import { z } from "zod";
import {
  MEMBERSHIP_RESOURCE_TYPES,
  MEMBERSHIP_ROLES,
  type MembershipResourceType,
  type MembershipRole,
} from "../../../domain/membership.entity";

export const MEMBERSHIP_ITEM_TYPE = "MEMBERSHIP";

export interface MembershipDynamoDBSchema {
  PK: `USER#${string}`;
  SK: `MEMBERSHIP#${string}`;
  ItemType: typeof MEMBERSHIP_ITEM_TYPE;
  UserId: string;
  ResourceId: string;
  ResourceType: MembershipResourceType;
  AccountId: string;
  Role: MembershipRole;
  Specialties?: string[];
  GSI1PK: `ORG#${string}` | `CLINIC#${string}`;
  GSI1SK: `MEMBER#${string}`;
}

export const membershipItemSchema = z.object({
  ResourceId: z.ulid(),
  ResourceType: z.enum(MEMBERSHIP_RESOURCE_TYPES),
  AccountId: z.ulid(),
  Role: z.enum(MEMBERSHIP_ROLES),
});
