import { MyProfile } from "@/components/profile/my-profile";
import { usersApi } from "@/lib/api/user";

interface Props {
  params: Promise<{ accountId: string }>;
}

export default async function MyProfilePage({ params }: Props) {
  const { accountId } = await params;
  const profile = await usersApi.getMyProfile();

  return (
    <div className="max-w-3xl">
      <MyProfile profile={profile} accountId={accountId} />
    </div>
  );
}
