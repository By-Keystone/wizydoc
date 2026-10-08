import type { IHasLiveMembership } from "@/application/queries/membership/has-live-membership.query";
import { getClient } from "../../transaction-context";

export class HasLiveMembership implements IHasLiveMembership {
  async execute(userId: string, accountId: string): Promise<boolean> {
    const membership = await getClient().userResourceMembership.findFirst({
      where: { userId, accountId, deletedAt: null },
      select: { id: true },
    });

    return membership !== null;
  }
}
