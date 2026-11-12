import type { ULID } from "ulid";

export interface IClinicRepository {
  findOrganizationId(clinicId: ULID): Promise<ULID | undefined>;
}
