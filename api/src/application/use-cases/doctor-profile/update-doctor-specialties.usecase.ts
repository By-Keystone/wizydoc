import { NotFound } from "@/application/errors/not-found.error";
import { OwnSpecialties } from "@/application/errors/own-specialties.error";
import type {
  IDoctorProfileRepository,
  SpecialtySummary,
} from "@/domain/repositories/doctor-profile.repository";
import type { DoctorSpecialtiesGuards } from "./doctor-specialties.guards";
import { Prisma } from "@prisma/client";

export interface UpdateDoctorSpecialtiesDto {
  userId: string;
  accountId: string;
  organizationId: string;
  clinicId: string;
  doctorProfileId: string;
  specialtyIds: string[];
}

export class UpdateDoctorSpecialtiesUseCase {
  constructor(
    private readonly doctorProfiles: IDoctorProfileRepository,
    private readonly guards: DoctorSpecialtiesGuards,
  ) {}

  async execute(
    dto: UpdateDoctorSpecialtiesDto,
  ): Promise<{ specialties: SpecialtySummary[] }> {
    await this.guards.assertCanEdit(dto);
    const doctor = await this.findDoctor(dto);

    // Después de findDoctor: a quien no es DOCTOR de la sede se le responde
    // 404 aunque el perfil sea suyo; por esta vía nunca edita las propias.
    if (doctor.userId === dto.userId) throw new OwnSpecialties();

    const specialtyIds =
      await this.guards.uniqueSpecialtiesOfClinicOrganization(
        dto.clinicId,
        dto.specialtyIds,
      );

    try {
      const specialties = await this.doctorProfiles.setSpecialties(
        doctor.id,
        specialtyIds,
      );
      return { specialties };
    } catch (error) {
      // P2025 no dice qué registro falta: se vuelve a leer el perfil.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        await this.findDoctor(dto);
        throw new NotFound("Especialidad no encontrada");
      }
      throw error;
    }
  }

  private async findDoctor(dto: UpdateDoctorSpecialtiesDto) {
    const doctor = await this.doctorProfiles.findClinicDoctor(
      dto.doctorProfileId,
      dto.clinicId,
    );
    if (!doctor) throw new NotFound("Médico no encontrado");
    return doctor;
  }
}
