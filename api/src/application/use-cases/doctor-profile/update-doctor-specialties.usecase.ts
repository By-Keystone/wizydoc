import { NotFound } from "@/application/errors/not-found.error";
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
    // El ADMIN también puede editar sus propias especialidades por esta vía
    // (decisión del 22 de octubre de 2026), igual que desde «Mi perfil»,
    // siempre que sea DOCTOR de la sede: si no, findDoctor responde 404.
    const doctor = await this.findDoctor(dto);

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
