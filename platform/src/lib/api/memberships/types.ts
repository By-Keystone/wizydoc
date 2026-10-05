import type { MembershipRole } from "@/lib/utils";

export interface OrganizationMembership {
  membershipId: string;
  resourceId: string;
  resourceName: string;
  resourceType: "ORGANIZATION";
  role: MembershipRole;
}

export interface ClinicMembership {
  membershipId: string | null;
  resourceId: string;
  resourceName: string;
  resourceType: "CLINIC";
  parentOrganization: {
    resourceId: string;
    name: string;
  };
  role: MembershipRole;
  accessVia: "DIRECT" | "INHERITED_FROM_ORG";
}

export type UserMembership = OrganizationMembership | ClinicMembership;
