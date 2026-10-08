export interface IHasLiveMembership {
  execute(userId: string, accountId: string): Promise<boolean>;
}
