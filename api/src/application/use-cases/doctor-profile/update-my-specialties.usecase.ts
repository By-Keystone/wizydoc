import { NotFound } from "@/application/errors/not-found.error";
import type {
  IDoctorProfileRepository,
  SpecialtySummary,
} from "@/domain/repositories/doctor-profile.repository";
import type { DoctorSpecialtiesGuards } from "./doctor-specialties.guards";
import { Prisma } from "@prisma/client";

export interface UpdateMySpecialtiesDto {
  userId: string;
  accountId: string;
  organizationId: string;
  clinicId: string;
  specialtyIds: string[];
}

export class UpdateMySpecialtiesUseCase {
  constructor(
    private readonly doctorProfiles: IDoctorProfileRepository,
    private readonly guards: DoctorSpecialtiesGuards,
  ) {}

  async execute(
    dto: UpdateMySpecialtiesDto,
  ): Promise<{ specialties: SpecialtySummary[] }> {
    await this.guards.assertCanEdit(dto);
    const specialtyIds =
      await this.guards.uniqueSpecialtiesOfClinicOrganization(
        dto.clinicId,
        dto.specialtyIds,
      );

    // Sin transacción: un P2002 aborta la transacción y el reintento del
    // repositorio ya no podría correr. El upsert anidado es atómico por sí solo.
    try {
      const specialties = await this.doctorProfiles.upsertSpecialties(
        dto.userId,
        dto.clinicId,
        specialtyIds,
      );
      return { specialties };
    } catch (error) {
      // Una especialidad borrada entre el conteo y la escritura.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFound("Especialidad no encontrada");
      }
      throw error;
    }
  }
}
