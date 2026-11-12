import type { ULID } from "ulid";

export interface IClinicRepository {
  findOrganizationId(clinicId: string): Promise<ULID | undefined>;
}
