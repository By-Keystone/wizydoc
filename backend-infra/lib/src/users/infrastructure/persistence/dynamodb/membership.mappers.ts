import type {
  Membership,
  NewMembership,
} from "../../../domain/membership.entity";
import { clinicPk } from "./clinic.schema";
import {
  MEMBERSHIP_ITEM_TYPE,
  type MembershipDynamoDBSchema,
  membershipItemSchema,
} from "./membership.schema";
import { organizationPk } from "./organization.schema";
import { pk } from "./user.schema";

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

export const fromNewMembershipToDynamo = ({
  userId,
  resourceId,
  resourceType,
  accountId,
  role,
  specialties,
}: NewMembership): MembershipDynamoDBSchema => ({
  PK: pk(userId),
  SK: `MEMBERSHIP#${resourceId}`,
  ItemType: MEMBERSHIP_ITEM_TYPE,
  UserId: userId,
  ResourceId: resourceId,
  ResourceType: resourceType,
  AccountId: accountId,
  Role: role,
  ...(specialties ? { Specialties: specialties } : {}),
  GSI1PK:
    resourceType === "ORGANIZATION"
      ? organizationPk(resourceId)
      : clinicPk(resourceId),
  GSI1SK: `MEMBER#${userId}`,
});
