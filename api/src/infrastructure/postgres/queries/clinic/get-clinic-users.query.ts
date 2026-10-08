import { getClient } from "../../transaction-context";

interface GetClinicUsersQueryResult {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
}

export class GetClinicUsersQuery {
  async execute(resourceId: string) {
    const users = await getClient().$queryRaw<GetClinicUsersQueryResult[]>`
        SELECT u.name, u.last_name as "lastName", u.email, u.phone, urm.role 
        FROM clinic c
        INNER JOIN user_resource_membership urm 
          ON urm.resource_id = ${resourceId}
        INNER JOIN public.user u ON u.id = urm.user_id
        WHERE c.resource_id = ${resourceId}
          AND urm.deleted_at IS NULL
    `;

    return users;
  }
}
