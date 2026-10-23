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
  /** Crea el perfil de la membership si no existe y reemplaza sus especialidades. */
  upsertForMembership(
    membershipId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]>;
  /** Perfil con membership DOCTOR viva en esa sede; null si no cumple. */
  findClinicDoctor(
    doctorProfileId: string,
    clinicId: string,
  ): Promise<{ id: string } | null>;
  /** Reemplaza por completo las especialidades de un perfil existente. */
  setSpecialties(
    doctorProfileId: string,
    specialtyIds: string[],
  ): Promise<SpecialtySummary[]>;
}
