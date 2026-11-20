import type { Account } from "../account.entity";

export interface IAccountRepository {
  findById(accountId: string): Promise<Account | undefined>;
}
