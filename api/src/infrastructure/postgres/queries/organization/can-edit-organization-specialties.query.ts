import type {
  CanEditOrganizationSpecialtiesDto,
  ICanEditOrganizationSpecialtiesQuery,
} from "@/application/queries/organization/can-edit-organization-specialties.query";
import { getClient } from "../../transaction-context";

export class CanEditOrganizationSpecialtiesQuery
  implements ICanEditOrganizationSpecialtiesQuery
{
  // El dueño se toma de Account.ownerId y no de User.role: ningún código
  // pone User.role en ADMIN, así que vale USER también para el dueño.
  private async isAccountOwner(userId: string, accountId: string) {
    const account = await getClient().account.findFirst({
      where: { id: accountId, ownerId: userId },
      select: { id: true },
    });
    return account !== null;
  }

  async execute({
    userId,
    accountId,
    organizationId,
  }: CanEditOrganizationSpecialtiesDto): Promise<boolean> {
    const client = getClient();

    if (await this.isAccountOwner(userId, accountId)) {
      const organization = await client.organization.findFirst({
        where: { resourceId: organizationId, accountId },
        select: { resourceId: true },
      });
      if (organization) return true;
    }

    const membership = await client.userResourceMembership.findFirst({
      where: {
        userId,
        resourceId: organizationId,
        accountId,
        role: "ADMIN",
        deletedAt: null,
      },
      select: { id: true },
    });
    return membership !== null;
  }

  async editableOrganizationIds(
    userId: string,
    accountId: string,
  ): Promise<string[]> {
    const client = getClient();

    if (await this.isAccountOwner(userId, accountId)) {
      const organizations = await client.organization.findMany({
        where: { accountId },
        select: { resourceId: true },
      });
      return organizations.map((organization) => organization.resourceId);
    }

    const memberships = await client.userResourceMembership.findMany({
      where: {
        userId,
        accountId,
        role: "ADMIN",
        deletedAt: null,
        resource: { type: "ORGANIZATION" },
      },
      select: { resourceId: true },
    });
    return memberships.map((membership) => membership.resourceId);
  }
}
