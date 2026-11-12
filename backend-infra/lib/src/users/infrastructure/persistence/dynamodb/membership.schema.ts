import { z } from "zod";
import {
  MEMBERSHIP_RESOURCE_TYPES,
  MEMBERSHIP_ROLES,
} from "../../../domain/membership.entity";

export const MEMBERSHIP_ITEM_TYPE = "MEMBERSHIP";

export const membershipItemSchema = z.object({
  ResourceId: z.ulid(),
  ResourceType: z.enum(MEMBERSHIP_RESOURCE_TYPES),
  AccountId: z.ulid(),
  Role: z.enum(MEMBERSHIP_ROLES),
});
