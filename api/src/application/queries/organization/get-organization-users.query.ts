import z from "zod";

export const getOrganizationUsersSchema = z.object({
  resourceId: z.uuid(),
});

export interface OrganizationUserRow {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  hasPendingInvitation: boolean;
}

export interface IGetOrganizationUsersQuery {
  execute(resourceId: string): Promise<OrganizationUserRow[]>;
}
