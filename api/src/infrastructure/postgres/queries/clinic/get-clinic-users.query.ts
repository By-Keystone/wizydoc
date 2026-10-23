import { sortedByName } from "../../repositories/doctor-profile.repository";
import { getClient } from "../../transaction-context";

interface GetClinicUsersQueryResult {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  doctorProfileId: string | null;
  specialties: { id: string; name: string }[];
}

export class GetClinicUsersQuery {
  async execute(resourceId: string) {
    // Sólo las filas DOCTOR traen perfil; las especialidades de otra organización se descartan.
    const users = await getClient().$queryRaw<GetClinicUsersQueryResult[]>`
        SELECT u.name, u.last_name as "lastName", u.email, u.phone, urm.role,
          dp.id as "doctorProfileId",
          COALESCE(
            (
              SELECT json_agg(
                json_build_object('id', s.id, 'name', s.name)
              )
              FROM "_DoctorProfileToSpecialty" dps
              INNER JOIN specialty s ON s.id = dps."B"
              WHERE dps."A" = dp.id
                AND s.organization_id = r.parent_resource_id
            ),
            '[]'::json
          ) as specialties
        FROM clinic c
        INNER JOIN resource r ON r.id = c.resource_id
        INNER JOIN user_resource_membership urm 
          ON urm.resource_id = ${resourceId}
        INNER JOIN public.user u ON u.id = urm.user_id
        LEFT JOIN doctor_profile dp
          ON dp.user_id = u.id
          AND dp.resource_id = c.resource_id
          AND urm.role = 'DOCTOR'
        WHERE c.resource_id = ${resourceId}
          AND urm.deleted_at IS NULL
        ORDER BY urm.created_at, u.id
    `;

    // Mismo orden que el PUT; el de la base depende de su colación.
    return users.map((user) => ({
      ...user,
      specialties: sortedByName(user.specialties),
    }));
  }
}
