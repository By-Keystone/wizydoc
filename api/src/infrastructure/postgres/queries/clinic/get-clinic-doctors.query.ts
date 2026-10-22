import type {
  IGetClinicDoctorsQuery,
  IGetClinicDoctorsQueryResult,
} from "@/application/queries/clinic/get-clinic-doctors.query";
import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";
import { formatDoctorName } from "@/domain/services/doctor-name";
import { getClient } from "../../transaction-context";

export class GetClinicDoctorsQuery implements IGetClinicDoctorsQuery {
  async execute(resourceId: string): Promise<IGetClinicDoctorsQueryResult[]> {
    const client = getClient();

    // DoctorProfile no tiene deleted_at: quitar al médico se registra en su membership.
    const doctors = await client.$queryRaw<
      (Omit<IGetClinicDoctorsQueryResult, "displayName"> & {
        treatment: DoctorTreatment | null;
      })[]
    >`
            SELECT dp.id AS "doctorProfileId", u.name, u.last_name AS "lastName", u.treatment, json_agg(
                json_build_object('id', s.id, 'name', s.name)
            ) as specialties
            FROM doctor_profile dp
            INNER JOIN public.user u ON dp.user_id = u.id
            INNER JOIN resource r ON r.id = dp.resource_id
            INNER JOIN "_DoctorProfileToSpecialty" dps ON dps."A" = dp.id
            INNER JOIN specialty s ON s.id = dps."B" AND s.organization_id = r.parent_resource_id
            WHERE dp.resource_id = ${resourceId}
            AND EXISTS (
                SELECT 1 FROM user_resource_membership urm
                WHERE urm.user_id = dp.user_id
                AND urm.resource_id = dp.resource_id
                AND urm.deleted_at IS NULL
            )
            -- Sin horarios no hay huecos que ofrecer.
            AND EXISTS (
                SELECT 1 FROM doctor_schedule ds
                WHERE ds.doctor_profile_id = dp.id
            )
            GROUP BY dp.id, u.id, u.name, u.last_name, u.treatment
        `;

    // Respuesta pública: se expone el nombre armado y no el tratamiento.
    return doctors.map(({ treatment, ...doctor }) => ({
      ...doctor,
      displayName: formatDoctorName({
        name: doctor.name,
        lastName: doctor.lastName,
        treatment,
      }),
    }));
  }
}
