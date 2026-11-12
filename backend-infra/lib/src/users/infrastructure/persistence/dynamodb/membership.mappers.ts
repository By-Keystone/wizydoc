import type { Membership } from "../../../domain/membership.entity";
import { membershipItemSchema } from "./membership.schema";

export const fromDynamoToMembership = (item: unknown): Membership => {
  const { ResourceId, ResourceType, AccountId, Role } =
    membershipItemSchema.parse(item);
  return {
    resourceId: ResourceId,
    resourceType: ResourceType,
    accountId: AccountId,
    role: Role,
  };
};
