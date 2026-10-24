export type AttendingOutcome = "created" | "revived" | "kept";

export interface GrantAttendingInput {
  userId: string;
  clinicId: string;
  accountId: string;
  createdBy: string;
}

export interface IMembershipRepository {
  /** Ids de los ADMIN vivos de la organización, acotados por cuenta. */
  findOrganizationAdminIds(
    organizationId: string,
    accountId: string,
  ): Promise<string[]>;
  /** Ids de las sedes de la organización, acotados por cuenta. */
  findOrganizationClinicIds(
    organizationId: string,
    accountId: string,
  ): Promise<string[]>;
  /** Deja a la persona como médico (DOCTOR con perfil) de la sede; no toca una membership viva. */
  grantAttending(input: GrantAttendingInput): Promise<AttendingOutcome>;
}
