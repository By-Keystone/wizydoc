import { TopNav } from "@/components/common";
import { getMe } from "@/lib/auth/me";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async ({ children }: { children: ReactNode }) => {
  const me = await getMe();

  if (!me) redirect("/login");
  if (!me.onboardingCompleted) redirect("/onboarding");

  return (
    <div className="h-svh">
      <TopNav />
      {children}
    </div>
  );
};
