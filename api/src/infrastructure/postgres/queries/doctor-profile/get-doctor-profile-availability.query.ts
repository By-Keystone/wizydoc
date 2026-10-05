import z from "zod";
import { getClient } from "../../transaction-context";

export const getDoctorProfileAvailabilityParamsSchema = z.object({
  doctorProfileId: z.string(),
});

export type GetDoctorProfileAvailabilityDto = z.infer<
  typeof getDoctorProfileAvailabilityParamsSchema
>;

export interface IGetDoctorProfileAvailabilityQueryResult {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export class GetDoctorProfileAvailabilityQuery {
  async execute(dto: GetDoctorProfileAvailabilityDto) {
    const client = getClient();

    const result = await client.$queryRaw<
      IGetDoctorProfileAvailabilityQueryResult[]
    >`
            SELECT a.id, a.day_of_week AS "dayOfWeek", a.start_time AS "startTime", a.end_time AS "endTime"
            FROM doctor_schedule a
            WHERE a.doctor_profile_id = ${dto.doctorProfileId}
        `;

    return result;
  }
}
