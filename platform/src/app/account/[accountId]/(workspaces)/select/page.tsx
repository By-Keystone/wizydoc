import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MembershipsList } from "@/components/account/select-membership/memberships-list";
import { TopHeader } from "@/components/account/select-membership/top-header";
import { type Membership, userMembershipsApi } from "@/lib/api/memberships";
import { getMe, type Me } from "@/lib/auth/me";
import { SWITCH_WORKSPACE_PARAM } from "@/lib/auth/workspace-paths";

export const metadata: Metadata = { title: "Elige dónde entrar" };

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function SelectPage({ searchParams }: Props) {
  const isSwitching =
    (await searchParams)[SWITCH_WORKSPACE_PARAM] !== undefined;

  const [me, memberships]: [Me | null, Membership[]] = await Promise.all([
    getMe(),
    userMembershipsApi.getUserMemberships(),
  ]);

  const clinics = memberships.flatMap((membership) => membership.clinics);

  if (me?.accountId && !isSwitching && clinics.length === 1) {
    redirect(
      `/account/${me.accountId}/clinic/${clinics[0].resourceId}/dashboard`,
    );
  }

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
