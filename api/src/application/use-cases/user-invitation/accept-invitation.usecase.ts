import { BadRequest } from "@/application/errors/bad-request.errors";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// 64 hex: formato que genera `invite-user.usecase.ts`; rechazarlo aquí evita tocar la base con basura.
export const invitationTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { error: "Token inválido" });

export const INVALID_INVITATION_MESSAGE =
  "El enlace de invitación no es válido o ya expiró";

const SET_PASSWORD_FIRST_MESSAGE =
  "Primero define tu contraseña desde el enlace de invitación";

export const acceptInvitationParamsSchema = z.object({
  token: invitationTokenSchema,
});

type AcceptInvitationDto = z.infer<typeof acceptInvitationParamsSchema>;

export class AcceptInvitationUseCase {
  async execute(data: AcceptInvitationDto) {
    return await inTransaction(async () => {
      const userId = await this.claimPendingInvitation(data.token);

      const authAccounts = await getClient().authAccount.findMany({
        where: { userId },
        select: { providerId: true },
      });

      // Si no tiene contraseña, la transacción se revierte: el token no se consume y debe usar `set-password`.
      this.ensureHasPasswordCredential(authAccounts);

      return { step: "login" as const };
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
  private ensureHasPasswordCredential(authAccounts: { providerId: string }[]) {
    const hasPasswordCredential = authAccounts.some(
      (account) => account.providerId === "credential",
    );

    if (!hasPasswordCredential) {
      throw new UnprocessableEntity(SET_PASSWORD_FIRST_MESSAGE);
    }
  }
}
