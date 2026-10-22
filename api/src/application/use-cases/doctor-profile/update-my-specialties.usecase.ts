import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import type { ICanEditOrganizationSpecialtiesQuery } from "@/application/queries/organization/can-edit-organization-specialties.query";
import type {
  IDoctorProfileRepository,
  SpecialtySummary,
} from "@/domain/repositories/doctor-profile.repository";
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
    private readonly canEdit: ICanEditOrganizationSpecialtiesQuery,
  ) {}

  async execute(
    dto: UpdateMySpecialtiesDto,
  ): Promise<{ specialties: SpecialtySummary[] }> {
    await this.assertClinicInOrganization(dto);
    await this.assertCanEditSpecialties(dto);
    const specialtyIds = await this.assertSpecialtiesBelongToClinicOrganization(
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

  // 404 y no 403: no revelar que la sede existe en otra cuenta u organización.
  private async assertClinicInOrganization(dto: UpdateMySpecialtiesDto) {
    const belongs = await this.doctorProfiles.clinicBelongsToOrganization(
      dto.clinicId,
      dto.organizationId,
      dto.accountId,
    );
    if (!belongs) throw new NotFound("Sede no encontrada");
  }

  private async assertCanEditSpecialties(dto: UpdateMySpecialtiesDto) {
    const allowed = await this.canEdit.execute({
      userId: dto.userId,
      accountId: dto.accountId,
      organizationId: dto.organizationId,
    });
    if (!allowed) {
      throw new Forbidden(
        "Solo un administrador puede cambiar especialidades.",
      );
    }
  }

  private async assertSpecialtiesBelongToClinicOrganization(
    clinicId: string,
    specialtyIds: string[],
  ) {
    const uniqueIds = [...new Set(specialtyIds)];
    const ownCount =
      await this.doctorProfiles.countSpecialtiesOfClinicOrganization(
        clinicId,
        uniqueIds,
      );

    // Mismo 404 para id inexistente y de otra cuenta.
    if (ownCount !== uniqueIds.length) {
      throw new NotFound("Especialidad no encontrada");
    }
    return uniqueIds;
  }
}
