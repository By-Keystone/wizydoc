import type { ULID } from "ulid";

export const MEMBERSHIP_ROLES = ["ADMIN", "DOCTOR", "USER"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_RESOURCE_TYPES = ["ORGANIZATION", "CLINIC"] as const;
export type MembershipResourceType = (typeof MEMBERSHIP_RESOURCE_TYPES)[number];

export interface Membership {
  resourceId: ULID;
  resourceType: MembershipResourceType;
  accountId: ULID;
  role: MembershipRole;
}

export interface NewMembership extends Membership {
  userId: ULID;
  specialties?: string[];
}
