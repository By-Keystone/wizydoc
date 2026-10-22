export interface SpecialtySummary {
  id: string;
  name: string;
}

export interface IDoctorProfileRepository {
  /** La sede es hija de esa organización y ambas son de la cuenta. */
  clinicBelongsToOrganization(
    clinicId: string,
    organizationId: string,
    accountId: string,
  ): Promise<boolean>;
  /** Cuántos de esos ids son especialidades de la organización padre de la sede. */
  countSpecialtiesOfClinicOrganization(
    clinicId: string,
    specialtyIds: string[],
  ): Promise<number>;
  /** Crea el perfil si no existe (t-1) y reemplaza sus especialidades. */
  upsertSpecialties(
    userId: string,
    clinicId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]>;
}
