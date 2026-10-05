import z from "zod";

export const getOrganizationsDoctorCountSchema = z.object({
  resourceId: z.string(),
});

export type GetOrganizationsDoctorCountDto = z.infer<
  typeof getOrganizationsDoctorCountSchema
>;

export interface GetOrganizationsDoctorCountQueryResult {
  doctorCount: number;
}

export interface IGetOrganizationsDoctorCountQuery {
  execute(
    dto: GetOrganizationsDoctorCountDto,
  ): Promise<GetOrganizationsDoctorCountQueryResult>;
}
