import { doFetchJson } from "@/lib/api/fetch";
import type { MembershipRole } from "@/lib/utils";
import { NoMembershipError } from "../errors";
import type { UserMembership } from "./types";

export type ClinicAccess = {
  resourceId: string;
  name: string;
  role: MembershipRole;
  accessVia: "INHERITED_FROM_ORG" | "DIRECT";
  membershipId?: string;
  joinedAt?: Date;
};

export type Membership = {
  organization: {
    resourceId: string;
    name: string;
  };
  membership: {
    membershipId: string;
    role: MembershipRole;
    joinedAt: Date;
  } | null;
  accountId: string | null;
  clinics: ClinicAccess[];
};

export const tags = {
  memberships: () => "memberships",
  membershipsForResource: (id: string) => `${id}-memberships`,
};

export const userMembershipsApi = {
  getUserMemberships: async (): Promise<Membership[]> => {
    const data = await doFetchJson<{ memberships?: Membership[] }>(
      "/user/me/memberships",
      {
        method: "GET",
        next: { tags: [tags.memberships()] },
      },
    );
    return data.memberships ?? [];
  },
  getMembershipForResource: async (
    resourceId: string,
  ): Promise<UserMembership> => {
    const membership = await doFetchJson<UserMembership | null>(
      `/user/me/resource/${resourceId}/membership`,
      { next: { tags: [tags.membershipsForResource(resourceId)] } },
    );

    if (!membership) throw new NoMembershipError();

    return membership;
  },
};
