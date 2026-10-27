import "server-only";

import { cache } from "react";
import { userMembershipsApi } from "@/lib/api/memberships";
import { getMe } from "./me";

export type OnboardingMode = "new-account" | "finish-clinic";

// Sin organizaciones equivale a sin memberships: ninguna ruta borra la del dueño.
export const getOnboardingMode = cache(
  async (): Promise<OnboardingMode | null> => {
    const me = await getMe();
    if (!me) return null;
    if (!me.onboardingCompleted) return "new-account";
    if (!me.isAccountOwner) return null;

    const memberships = await userMembershipsApi.getUserMemberships();
    return memberships.length === 0 ? "finish-clinic" : null;
  },
);
