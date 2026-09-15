import { getClient } from "./transaction-context";

/**
 * Serializa por cuenta las altas que consumen cuota. Sin esto, dos peticiones
 * simultáneas cuentan sobre la misma foto —READ COMMITTED no le muestra a una
 * lo que la otra aún no ha confirmado—, las dos ven hueco y las dos insertan.
 *
 * Hay que llamarlo dentro de una transacción y antes de contar: el bloqueo se
 * libera al confirmarla, y quien llegue segundo espera aquí hasta ver el total
 * ya actualizado.
 */
export async function lockAccountQuota(accountId: string): Promise<void> {
  await getClient().$queryRaw`
    SELECT 1 FROM subscription WHERE account_id = ${accountId}::uuid FOR UPDATE
  `;
}
