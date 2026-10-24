import type {
  IGetOrganizationUsersQuery,
  OrganizationUserAccess,
  OrganizationUserRow,
} from "@/application/queries/organization/get-organization-users.query";
import { getClient } from "../../transaction-context";

export class GetOrganizationUsersQuery implements IGetOrganizationUsersQuery {
  async execute(
    resourceId: string,
    accountId: string,
  ): Promise<OrganizationUserRow[] | null> {
    const client = getClient();

    // La política acepta una sede por herencia: aquí sólo se lee una organización de la cuenta.
    const organization = await client.organization.findFirst({
      where: { resourceId, accountId },
      select: { resourceId: true },
    });
    if (!organization) return null;

    const memberships = await client.userResourceMembership.findMany({
      where: {
        accountId,
        deletedAt: null,
        resource: {
          accountId,
          OR: [
            { id: resourceId },
            { parentResourceId: resourceId, type: "CLINIC" },
          ],
        },
      },
      select: {
        role: true,
        resourceId: true,
        resource: {
          select: { type: true, clinic: { select: { name: true } } },
        },
        user: {
          select: {
            id: true,
            name: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const userIds = [...new Set(memberships.map((m) => m.user.id))];
    const withPassword = new Set(
      (
        await client.authAccount.findMany({
          where: { userId: { in: userIds }, providerId: "credential" },
          select: { userId: true },
        })
      ).map((account) => account.userId),
    );

    const people = new Map<
      string,
      { row: OrganizationUserRow; accesses: OrganizationUserAccess[] }
    >();
    for (const membership of memberships) {
      const { user } = membership;
      let person = people.get(user.id);
      if (!person) {
        const accesses: OrganizationUserAccess[] = [];
        person = {
          accesses,
          row: {
            name: user.name,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            invitationStatus: withPassword.has(user.id) ? null : "pending",
            accesses,
          },
        };
        people.set(user.id, person);
      }
      const isOrganization = membership.resource.type === "ORGANIZATION";
      person.accesses.push({
        clinicId: isOrganization ? null : membership.resourceId,
        clinicName: isOrganization
          ? null
          : (membership.resource.clinic?.name ?? ""),
        role: membership.role,
      });
    }

    return [...people.values()].map(({ row }) => ({
      ...row,
      accesses: row.accesses.sort(
        (a, b) =>
          Number(a.clinicId !== null) - Number(b.clinicId !== null) ||
          (a.clinicName ?? "").localeCompare(b.clinicName ?? "", "es"),
      ),
    }));
  }
}
