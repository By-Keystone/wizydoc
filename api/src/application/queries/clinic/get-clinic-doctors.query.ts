import z from "zod";

export const getClinicDoctorsParamsSchema = z.object({
  clinicId: z.string(),
});

export type GetClinicDoctorsDto = z.infer<typeof getClinicDoctorsParamsSchema>;

export interface IGetClinicDoctorsQueryResult {
  doctorProfileId: string;
  specialties: {
    id: string;
    name: string
  }[];
  name: string;
  lastName: string;
}

export interface IGetClinicDoctorsQuery {
  execute(resourceId: string): Promise<IGetClinicDoctorsQueryResult[]>;
}
