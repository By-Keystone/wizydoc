import z from "zod";

export const getOrganizationsClinicCountSchema = z.object({
  resourceId: z.string(),
});

export type GetOrganizationsClinicCountDto = z.infer<
  typeof getOrganizationsClinicCountSchema
>;

export interface GetOrganizationsClinicCountQueryResult {
  clinicCount: number;
}

export interface IGetOrganizationsClinicCountQuery {
  execute(
    dto: GetOrganizationsClinicCountDto,
  ): Promise<GetOrganizationsClinicCountQueryResult>;
}
