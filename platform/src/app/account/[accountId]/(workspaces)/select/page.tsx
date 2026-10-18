import { MembershipsList } from "@/components/account/select-membership/memberships-list";
import { TopHeader } from "@/components/account/select-membership/top-header";
import { type Membership, userMembershipsApi } from "@/lib/api/memberships";
import { getMe, type Me } from "@/lib/auth/me";

export default async function SelectPage() {
  const [me, memberships]: [Me | null, Membership[]] = await Promise.all([
    getMe(),
    userMembershipsApi.getUserMemberships(),
  ]);

  // Sin memberships equivale a 0 organizaciones: ninguna ruta borra la del dueño.
  const canCreateOrganization =
    (!!me?.isAccountOwner && memberships.length === 0) ||
    memberships.some((membership) => membership.membership?.role === "ADMIN");

  return (
    <div className="px-8 py-4 flex flex-col">
      <TopHeader canCreateOrganization={canCreateOrganization} />
      <MembershipsList memberships={memberships} />
    </div>
  );
}
