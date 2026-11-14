import type { Membership } from "../../../domain/membership.entity";
import type { MembershipDynamoDBSchema } from "./membership.schema";

export const fromDynamoToMembership = ({
  ResourceId,
  ResourceType,
  AccountId,
  Role,
}: Pick<
  MembershipDynamoDBSchema,
  "ResourceId" | "ResourceType" | "AccountId" | "Role"
>): Membership => ({
  resourceId: ResourceId,
  resourceType: ResourceType,
  accountId: AccountId,
  role: Role,
});
