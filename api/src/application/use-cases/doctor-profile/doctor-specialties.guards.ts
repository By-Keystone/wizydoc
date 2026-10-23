import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import type { ICanEditOrganizationSpecialtiesQuery } from "@/application/queries/organization/can-edit-organization-specialties.query";
import type { IDoctorProfileRepository } from "@/domain/repositories/doctor-profile.repository";

interface SpecialtiesScope {
  userId: string;
  accountId: string;
  organizationId: string;
  clinicId: string;
}

export class DoctorSpecialtiesGuards {
  constructor(
    private readonly doctorProfiles: IDoctorProfileRepository,
    private readonly canEdit: ICanEditOrganizationSpecialtiesQuery,
  ) {}

  // Primer paso de todo caso de uso que edite especialidades: las rutas no
  // declaran `roles`, así que esta es la única autorización.
  async assertCanEdit(scope: SpecialtiesScope): Promise<void> {
    await this.assertClinicInOrganization(scope);
    await this.assertCanEditSpecialties(scope);
  }

  async uniqueSpecialtiesOfClinicOrganization(
    clinicId: string,
    specialtyIds: string[],
  ): Promise<string[]> {
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

  // 404 y no 403: no revelar que la sede existe en otra cuenta u organización.
  private async assertClinicInOrganization(scope: SpecialtiesScope) {
    const belongs = await this.doctorProfiles.clinicBelongsToOrganization(
      scope.clinicId,
      scope.organizationId,
      scope.accountId,
    );
    if (!belongs) throw new NotFound("Sede no encontrada");
  }

  private async assertCanEditSpecialties(scope: SpecialtiesScope) {
    const allowed = await this.canEdit.execute({
      userId: scope.userId,
      accountId: scope.accountId,
      organizationId: scope.organizationId,
    });
    if (!allowed) {
      throw new Forbidden(
        "Solo un administrador puede cambiar especialidades.",
      );
    }
  }
}
