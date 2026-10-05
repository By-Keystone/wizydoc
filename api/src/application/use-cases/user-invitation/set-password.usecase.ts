import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import auth from "@/infrastructure/vendors/auth/better-auth/auth";

// 64 hex: formato que genera `invite-user.usecase.ts`; rechazarlo aquí evita tocar la base o el hash con basura.
export const invitationTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { error: "Token inválido" });

export const INVALID_INVITATION_MESSAGE =
  "El enlace de invitación no es válido o ya expiró";

export const setPasswordSchema = z.object({
  token: invitationTokenSchema,
  password: z.string().min(8).max(128),
});

type SetPasswordDTO = z.infer<typeof setPasswordSchema>;

export class SetPasswordUseCase {
  async execute(data: SetPasswordDTO) {
    if (!(await this.isInvitationPending(data.token))) {
      throw new BadRequest(INVALID_INVITATION_MESSAGE);
    }

    // Hash fuera de la transacción: no retiene el bloqueo de fila mientras se calcula.
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(data.password);

    return await inTransaction(async () => {
      const userId = await this.claimPendingInvitation(data.token);

      // Serializa con otra invitación pendiente del mismo usuario: sin el bloqueo, dos podrían crear dos cuentas `credential` a la vez.
      await getClient().$queryRaw`
        SELECT id FROM "user" WHERE id = ${userId}::uuid FOR UPDATE
      `;

      const authAccounts = await getClient().authAccount.findMany({
        where: { userId },
        select: { providerId: true },
      });

      this.ensureNoPasswordCredential(authAccounts);

      await getClient().authAccount.create({
        data: {
          providerId: "credential",
          userId,
          accountId: userId,
          password: hash,
        },
      });

      const user = await getClient().user.update({
        where: { id: userId },
        data: { confirmed: true, onboardingCompleted: true },
      });

      return { accountId: user.accountId, email: user.email };
    });
  }

  private pendingInvitationWhere(token: string) {
    return {
      token,
      status: "INVITED" as const,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      membership: { deletedAt: null },
    };
  }

  // Lectura barata para no pagar el hash con un token ya inválido; no sustituye `claimPendingInvitation`, que es lo que hace el token de un solo uso.
  private async isInvitationPending(token: string): Promise<boolean> {
    const invitation = await getClient().userInvitation.findFirst({
      where: this.pendingInvitationWhere(token),
      select: { id: true },
    });

    return !!invitation;
  }

  // Debe llamarse dentro de una transacción: el `updateMany` condicional hace el token de un solo uso bajo READ COMMITTED (una segunda petición concurrente reevalúa el `WHERE` tras el commit de la primera y obtiene `count = 0`).
  private async claimPendingInvitation(token: string): Promise<string> {
    const client = getClient();

    const { count } = await client.userInvitation.updateMany({
      where: this.pendingInvitationWhere(token),
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    if (count !== 1) throw new BadRequest(INVALID_INVITATION_MESSAGE);

    const invitation = await client.userInvitation.findUniqueOrThrow({
      where: { token },
      select: { membership: { select: { userId: true } } },
    });

    return invitation.membership.userId;
  }

  // Igual que Better Auth: basta con `providerId === "credential"`, sin mirar `password`.
  private ensureNoPasswordCredential(authAccounts: { providerId: string }[]) {
    const hasPasswordCredential = authAccounts.some(
      (account) => account.providerId === "credential",
    );

    if (hasPasswordCredential) {
      throw new UnprocessableEntity(
        "Ya tienes una contraseña. Inicia sesión para aceptar la invitación.",
      );
    }
  }
}
