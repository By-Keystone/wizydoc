import type {
  Membership,
  NewMembership,
} from "../../../domain/membership.entity";
import { clinicPk } from "./clinic.schema";
import {
  MEMBERSHIP_ITEM_TYPE,
  type MembershipDynamoDBSchema,
} from "./membership.schema";
import { organizationPk } from "../../../../users/infrastructure/persistence/dynamodb/organization.schema";
import { pk } from "../../../../users/infrastructure/persistence/dynamodb/user.schema";

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

export const fromMembershipToDynamo = ({
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
