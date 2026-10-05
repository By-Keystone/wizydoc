import type { Account } from "@/domain/entities/account/entity";
import type {
  CreateAccountDto,
  IAccountRepository,
} from "@/domain/repositories/account.repository";
import { toDomain } from "@/infrastructure/mappers/account/mapper";
import { getClient } from "../transaction-context";

export class AccountRepository implements IAccountRepository {
  async save(dto: CreateAccountDto): Promise<Account> {
    const account = await getClient().account.create({ data: dto });

    return toDomain(account);
  }

  async findByOwnerId(ownerId: string): Promise<Account | undefined> {
    const account = await getClient().account.findFirst({ where: { ownerId } });

    if (!account) return;

    return toDomain(account);
  }

  async findById(id: string): Promise<Account | undefined> {
    const account = await getClient().account.findUnique({ where: { id } });

    if (!account) return;

    return toDomain(account);
  }
}
