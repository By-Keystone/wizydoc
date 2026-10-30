import type {
  AccountOwner,
  IGetAccountOwner,
} from "@/application/queries/account/get-account-owner.query";
import { getClient } from "../../transaction-context";

export class GetAccountOwner implements IGetAccountOwner {
  async execute(accountId: string): Promise<AccountOwner | null> {
    const owners = await getClient().$queryRaw<AccountOwner[]>`
      SELECT u.email, u.name, u.last_name AS "lastName"
      FROM account a
      INNER JOIN public.user u ON u.id = a.owner_id
      WHERE a.id = ${accountId}::uuid
    `;
    return owners[0] ?? null;
  }
}
