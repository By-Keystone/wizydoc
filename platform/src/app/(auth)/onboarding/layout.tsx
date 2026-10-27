import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth/me";
import { getActiveResource } from "@/lib/auth/guards";
import { getOnboardingMode } from "@/lib/auth/onboarding-mode";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  if (await getOnboardingMode()) return <>{children}</>;

  const { resourceId, resourceType } = await getActiveResource();
  if (!resourceId || !resourceType) {
    redirect(`/account/${me.accountId}/select`);
  }

  redirect(
    `/account/${me.accountId}/${resourceType.toLowerCase()}/${resourceId}`,
  );
}
