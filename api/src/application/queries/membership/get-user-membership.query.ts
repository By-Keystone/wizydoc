import z from "zod";

export interface OrganizationMembership {
  membershipId: string;
  resourceId: string;
  resourceName: string;
  resourceType: "ORGANIZATION";
  role: "ADMIN" | "DOCTOR" | "USER";
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
  role: "ADMIN" | "DOCTOR" | "USER";
  accessVia: "DIRECT" | "INHERITED_FROM_ORG";
  doctorProfileId: string | null;
}

export type UserMembership = OrganizationMembership | ClinicMembership;

export const getUserMembershipSchema = z.object({
  resourceId: z.string(),
});

export type GetUserMembershipDto = z.infer<typeof getUserMembershipSchema> & {
  userId: string;
};

export interface IGetUserMembership {
  execute(dto: GetUserMembershipDto): Promise<UserMembership | undefined>;
}
