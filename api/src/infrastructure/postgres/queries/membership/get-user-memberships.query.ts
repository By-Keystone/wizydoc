import type {
  ClinicAccess,
  IUserMembershipsQuery,
  OrganizationGroup,
} from "@/application/queries/membership/get-user-memberships.query";
import type { MembershipRole } from "@/domain/enums/membership-role";
import { getClient } from "../../transaction-context";

const ROLE_RANK: Record<MembershipRole, number> = {
  ADMIN: 100,
  DOCTOR: 50,
  USER: 10,
};

function maxRole(a: MembershipRole, b: MembershipRole): MembershipRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export class UserMembershipsQuery implements IUserMembershipsQuery {
  async execute(
    userId: string,
    accountId: string,
  ): Promise<OrganizationGroup[]> {
    const memberships = await getClient().userResourceMembership.findMany({
      where: { userId, accountId },
      include: {
        user: true,
        resource: {
          include: {
            organization: true,
            children: { include: { clinic: true } },
            clinic: true,
            parent: { include: { organization: true } },
          },
        },
      },
    });

    const groups = new Map<string, OrganizationGroup>();

    for (const m of memberships) {
      if (m.resource.type !== "ORGANIZATION") continue;
      const org = m.resource.organization!;
      const role = m.role as MembershipRole;

      groups.set(org.resourceId, {
        organization: { resourceId: org.resourceId, name: org.name },
        accountId: m.user.accountId,
        membership: {
          membershipId: m.id,
          role,
          joinedAt: m.createdAt,
        },
        clinics: m.resource.children
          .filter((child) => child.clinic !== null)
          .map<ClinicAccess>((child) => ({
            resourceId: child.id,
            resourceType: child.type,
            name: child.clinic!.name,
            role,
            accessVia: "INHERITED_FROM_ORG",
          })),
      });
    }

    for (const m of memberships) {
      if (m.resource.type !== "CLINIC") continue;
      const clinic = m.resource.clinic!;
      const parentOrg = m.resource.parent?.organization;
      if (!parentOrg) continue;
      const orgId = parentOrg.resourceId;
      const directRole = m.role as MembershipRole;

      let group = groups.get(orgId);

      if (!group) {
        group = {
          organization: {
            resourceId: parentOrg.resourceId,
            name: parentOrg.name,
          },
          accountId: m.user.accountId,
          membership: null,
          clinics: [],
        };
        groups.set(orgId, group);
      }

      const existing = group.clinics.find(
        (c) => c.resourceId === clinic.resourceId,
      );

      if (existing) {
        const effective = maxRole(existing.role, directRole);
        existing.role = effective;

        if (effective === directRole) {
          existing.membershipId = m.id;
          existing.joinedAt = m.createdAt;
          existing.accessVia = "DIRECT";
        }
      } else {
        group.clinics.push({
          resourceId: clinic.resourceId,
          name: clinic.name,
          role: directRole,
          accessVia: "DIRECT",
          membershipId: m.id,
          joinedAt: m.createdAt,
        });
      }
    }

    return Array.from(groups.values());
  }
}
