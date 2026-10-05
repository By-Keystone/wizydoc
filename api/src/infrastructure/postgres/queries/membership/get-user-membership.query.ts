import type {
  GetUserMembershipDto,
  IGetUserMembership,
  UserMembership,
} from "@/application/queries/membership/get-user-membership.query";
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

export class GetUserMembership implements IGetUserMembership {
  async execute({
    resourceId,
    userId,
  }: GetUserMembershipDto): Promise<UserMembership | undefined> {
    const resourceInclude = {
      organization: true,
      clinic: true,
      parent: { include: { organization: true } },
    } as const;

    const direct = await getClient().userResourceMembership.findUnique({
      where: { userId_resourceId: { userId, resourceId } },
      include: { resource: { include: resourceInclude } },
    });

    if (direct?.resource.type === "ORGANIZATION") {
      const org = direct.resource.organization!;
      return {
        membershipId: direct.id,
        resourceId,
        resourceName: org.name,
        resourceType: "ORGANIZATION",
        role: direct.role as MembershipRole,
      };
    }

    // The resource is a clinic: its parent resource is the organization.
    const resource =
      direct?.resource ??
      (await getClient().resource.findUnique({
        where: { id: resourceId },
        include: resourceInclude,
      }));

    const clinic = resource?.clinic ?? null;
    const parentOrg = resource?.parent?.organization ?? null;
    const organizationId = resource?.parentResourceId ?? null;

    if (!clinic || !parentOrg || !organizationId) return;

    const inherited = await getClient().userResourceMembership.findUnique({
      where: {
        userId_resourceId: { userId, resourceId: organizationId },
      },
    });

    if (!direct && !inherited) return;

    const directRole = direct ? (direct.role as MembershipRole) : null;
    const inheritedRole = inherited ? (inherited.role as MembershipRole) : null;

    let role: MembershipRole;
    let accessVia: "DIRECT" | "INHERITED_FROM_ORG";
    let membershipId: string | null;

    if (directRole && inheritedRole) {
      role = maxRole(directRole, inheritedRole);
      if (role === inheritedRole && role !== directRole) {
        accessVia = "INHERITED_FROM_ORG";
        membershipId = null;
      } else {
        accessVia = "DIRECT";
        membershipId = direct!.id;
      }
    } else if (directRole) {
      role = directRole;
      accessVia = "DIRECT";
      membershipId = direct!.id;
    } else {
      role = inheritedRole!;
      accessVia = "INHERITED_FROM_ORG";
      membershipId = null;
    }

    return {
      membershipId,
      resourceId,
      resourceName: clinic.name,
      resourceType: "CLINIC",
      parentOrganization: {
        resourceId: parentOrg.resourceId,
        name: parentOrg.name,
      },
      role,
      accessVia,
    };
  }
}
