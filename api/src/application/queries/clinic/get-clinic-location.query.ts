import z from "zod";

export const getClinicLocationParamsSchema = z.object({
  clinicId: z.uuid(),
});

export interface IGetClinicLocationQueryResult {
  name: string;
  address: string;
}

export interface IGetClinicLocationQuery {
  execute(clinicId: string): Promise<IGetClinicLocationQueryResult | null>;
}
