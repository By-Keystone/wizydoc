import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { AsyncLocalStorage } from "node:async_hooks";

type TxClient = Prisma.TransactionClient | typeof prisma;
const storage = new AsyncLocalStorage<TxClient>();

export const getClient = (): TxClient => storage.getStore() ?? prisma;

export const runWithClient = <T>(client: TxClient, fn: () => Promise<T>) =>
  storage.run(client, fn);

export async function inTransaction<T>(work: () => Promise<T>): Promise<T> {
  const current = storage.getStore();
  if (current) return work();
  return prisma.$transaction((tx) => runWithClient(tx, work));
}
