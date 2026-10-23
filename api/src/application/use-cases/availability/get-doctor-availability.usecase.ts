import { NotFound } from "@/application/errors/not-found.error";
import { liveDoctorProfileWhere } from "@/infrastructure/postgres/queries/doctor-profile/live-doctor-profile";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// El parámetro se llama `resourceId` por convención: es el nombre que busca
// `checkResource` en la política. La URL no cambia.
export const getDoctorAvailabilityParamsSchema = z.object({
  resourceId: z.string({ error: "Clinic ID must be defined" }),
});

export type GetDoctorAvailabilityDto = { clinicId: string; userId: string };

export class GetDoctorAvailabilityUseCase {
  async execute(dto: GetDoctorAvailabilityDto) {
    const client = getClient();

    const doctorProfile = await client.doctorProfile.findFirst({
      where: liveDoctorProfileWhere({
        userId: dto.userId,
        clinicId: dto.clinicId,
      }),
      select: { id: true },
    });

    if (!doctorProfile)
      throw new NotFound("User is not a doctor on this clinic");

    const availabilities = await client.availability.findMany({
      where: {
        doctorProfileId: doctorProfile.id,
      },
    });

    return { availabilities };
  }
}
