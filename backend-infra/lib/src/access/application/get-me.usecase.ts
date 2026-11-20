import type { IAccountRepository } from "../../accounts/domain/repository/account.repository";
import type { User } from "../../users/domain/user.entity";

export interface Me {
  user: User;
  isAccountOwner: boolean;
}

export class GetMeUseCase {
  constructor(
    private readonly accounts: Pick<IAccountRepository, "findById">,
  ) {}

  async execute(user: User): Promise<Me> {
    const account = await this.accounts.findById(user.accountId);
    if (!account) throw new Error("El usuario no tiene cuenta.");
    return { user, isAccountOwner: account.ownerUserId === user.id };
  }
}
