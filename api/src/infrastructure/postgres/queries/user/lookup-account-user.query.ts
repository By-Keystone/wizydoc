import {
  LookedUpAccountUser,
  LookupAccountUserDto,
} from "@/application/queries/user/lookup-account-user.query";
import { getClient } from "../../transaction-context";

export class LookupAccountUserQuery {
  async execute({
    resourceId,
    email,
  }: LookupAccountUserDto): Promise<LookedUpAccountUser | null> {
    const client = getClient();

    const resource = await client.resource.findUnique({
      where: { id: resourceId },
      select: { accountId: true },
    });

    if (!resource) return null;

    return await client.user.findFirst({
      where: { email, accountId: resource.accountId },
      select: { name: true, lastName: true, phone: true },
    });
  }
}
