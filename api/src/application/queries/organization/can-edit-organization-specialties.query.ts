export interface CanEditOrganizationSpecialtiesDto {
  userId: string;
  accountId: string;
  organizationId: string;
}

export interface ICanEditOrganizationSpecialtiesQuery {
  execute(dto: CanEditOrganizationSpecialtiesDto): Promise<boolean>;
  editableOrganizationIds(userId: string, accountId: string): Promise<string[]>;
}
