import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";

export const finishPasswordResetSchema = z.object({ userId: z.uuid() });

export type FinishPasswordResetDto = z.infer<typeof finishPasswordResetSchema>;

// No lanza: Better Auth cierra las sesiones después de llamarnos, y si esto
// fallara quedarían abiertas aunque la contraseña ya cambió.
export class FinishPasswordResetUseCase {
  async execute(data: FinishPasswordResetDto) {
    try {
      const { userId } = finishPasswordResetSchema.parse(data);

      await inTransaction(async () => {
        const client = getClient();

        // Abrir el enlace prueba que controla la bandeja, igual que el de
        // confirmación; sin esto, quien no confirmó terminaría en un login que
        // lo rechaza.
        await client.user.updateMany({
          where: { id: userId, confirmed: false },
          data: { confirmed: true },
        });

        // Solo la recuperación escribe filas con `value = userId` en
        // `verification` (la confirmación de correo usa un JWT). Si se agrega
        // otro plugin que use la tabla, este filtro debe acotarse al prefijo.
        await client.verification.deleteMany({ where: { value: userId } });
      });
    } catch (error) {
      console.error(
        `[password-reset]: no se pudo cerrar la recuperación del usuario ${data.userId}`,
        error instanceof Error ? error.name : "UnknownError",
      );
    }
  }
}
