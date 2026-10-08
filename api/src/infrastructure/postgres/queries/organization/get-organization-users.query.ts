import type {
  IGetOrganizationUsersQuery,
  OrganizationUserRow,
} from "@/application/queries/organization/get-organization-users.query";
import { getClient } from "../../transaction-context";

export class GetOrganizationUsersQuery implements IGetOrganizationUsersQuery {
  async execute(resourceId: string) {
    return await getClient().$queryRaw<OrganizationUserRow[]>`
        SELECT u.name, u.last_name AS "lastName", u.email, u.phone, urm.role,
          COALESCE(ui.status = 'INVITED' AND ui.expires_at > now(), false) AS "hasPendingInvitation"
        FROM organization o
        INNER JOIN user_resource_membership urm
          ON urm.resource_id = o.resource_id
        INNER JOIN public.user u ON u.id = urm.user_id
        LEFT JOIN user_invitation ui ON ui.membership_id = urm.id
        WHERE o.resource_id = ${resourceId}::uuid
          AND urm.deleted_at IS NULL
        ORDER BY urm.created_at, u.id
    `;
  }
}
