import type { Account } from "../entities/account/entity";

export interface CreateAccountDto {
  name: string;
  ownerId: string;
}

export interface IAccountRepository {
  save(dto: CreateAccountDto): Promise<Account>;
  findByOwnerId(ownerId: string): Promise<Account | undefined>;
  findById(id: string): Promise<Account | undefined>;
}
