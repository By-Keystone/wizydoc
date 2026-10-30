import { getClient } from "./transaction-context";

// Contar después de bloquear, en READ COMMITTED; toda inserción en appointment debe tomar este bloqueo.
export async function lockAccount(accountId: string): Promise<void> {
  await getClient().$queryRaw`
    SELECT 1 FROM account WHERE id = ${accountId}::uuid FOR NO KEY UPDATE
  `;
}
