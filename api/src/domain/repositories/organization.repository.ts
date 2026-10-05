import type { Organization } from "../entities/organization/entity";

export interface CreateOrganizationData {
  name: string;
  userId: string;
  accountId: string;
}

export interface IOrganizationRepository {
  save(data: CreateOrganizationData): Promise<Organization>;
  findByCreatedBy(createdBy: string): Promise<boolean>;
}
