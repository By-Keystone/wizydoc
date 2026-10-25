import "server-only";

import { AuthExpiredError, NoMembershipError } from "@/lib/api/errors";
import { userMembershipsApi } from "@/lib/api/memberships";
import { usersApi } from "@/lib/api/user";
import { redirect } from "next/navigation";
import { switchWorkspacePath } from "./workspace-paths";

interface Workspace {
  accountId: string;
  resourceId: string;
  resourceType: "clinic" | "organization";
}

export async function loadWorkspace({
  accountId,
  resourceId,
  resourceType,
}: Workspace) {
  try {
    const [user, membership] = await Promise.all([
      usersApi.getMe(),
      userMembershipsApi.getMembershipForResource(resourceId),
    ]);

    return { user, membership };
  } catch (error) {
    if (error instanceof AuthExpiredError) {
      const callbackUrl = `/account/${accountId}/${resourceType}/${resourceId}`;
      redirect(`/login?${new URLSearchParams({ callbackUrl })}`);
    }
    if (error instanceof NoMembershipError) {
      redirect(switchWorkspacePath(accountId));
    }

    throw error;
  }
}
