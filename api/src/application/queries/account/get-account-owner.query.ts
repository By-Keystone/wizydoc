export interface AccountOwner {
  email: string;
  name: string;
  lastName: string;
}

export interface IGetAccountOwner {
  execute(accountId: string): Promise<AccountOwner | null>;
}
