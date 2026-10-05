import type { Account } from "@/domain/entities/account/entity";
import type { Account as PrismaAccount } from "@prisma/client";

export function toDomain(account: PrismaAccount): Account {
  return {
    id: account.id,
    name: account.name,
    ownerId: account.ownerId,
  };
}
