import z from "zod";

export const getOrganizationUsersSchema = z.object({
  resourceId: z.uuid(),
});

export interface OrganizationUserAccess {
  clinicId: string | null;
  clinicName: string | null;
  role: "ADMIN" | "DOCTOR" | "USER";
}

export interface OrganizationUserRow {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  invitationStatus: "pending" | null;
  accesses: OrganizationUserAccess[];
}

export interface IGetOrganizationUsersQuery {
  execute(
    resourceId: string,
    accountId: string,
  ): Promise<OrganizationUserRow[] | null>;
}
