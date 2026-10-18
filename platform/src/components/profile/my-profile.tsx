import { UserAvatar } from "@/components/common/user-avatar";
import type { MyProfile as MyProfileData } from "@/lib/api/user/types";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PasswordCard } from "./password-card";
import { PersonalDataCard } from "./personal-data-card";
import { WhereYouWorkCard } from "./where-you-work-card";

interface Props {
  profile: MyProfileData;
  accountId: string;
  backHref?: string;
}

export function MyProfile({ profile, accountId, backHref }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-sm text-brand-gray transition-colors hover:text-brand-ink"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a tus workspaces
        </Link>
      )}

      <div className="flex items-center gap-3.5">
        <UserAvatar name={profile.name} lastName={profile.lastName} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words text-[22px] font-bold text-brand-teal-dark">
            {profile.name} {profile.lastName}
          </h1>
          <p className="mt-0.5 break-words text-[13.5px] text-brand-gray">
            {profile.email}
          </p>
        </div>
      </div>

      <PersonalDataCard profile={profile} />
      <WhereYouWorkCard clinics={profile.clinics} accountId={accountId} />
      <PasswordCard />
    </div>
  );
}
