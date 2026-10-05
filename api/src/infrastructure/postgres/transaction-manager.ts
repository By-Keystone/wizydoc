import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { prisma } from "./client";
import { runWithClient } from "./transaction-context";

export class PostgresTransactionManager implements ITransactionManager {
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => runWithClient(tx, work));
  }
}
