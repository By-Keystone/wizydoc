import type { Metadata } from "next";
import { MyProfile } from "@/components/profile/my-profile";
import { usersApi } from "@/lib/api/user";
import { switchWorkspacePath } from "@/lib/auth/workspace-paths";

export const metadata: Metadata = { title: "Mi perfil" };

interface Props {
  params: Promise<{ accountId: string }>;
}

export default async function MyProfilePage({ params }: Props) {
  const { accountId } = await params;
  const profile = await usersApi.getMyProfile();

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <MyProfile
        profile={profile}
        accountId={accountId}
        backHref={switchWorkspacePath(accountId)}
      />
    </div>
  );
}
