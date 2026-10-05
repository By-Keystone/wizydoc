import { BadRequest } from "@/application/errors/bad-request.errors";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// 64 hex: formato que genera `invite-user.usecase.ts`; rechazarlo aquí evita tocar la base o el hash con basura.
export const invitationTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { error: "Token inválido" });

export const INVALID_INVITATION_MESSAGE =
  "El enlace de invitación no es válido o ya expiró";

// Igual que Better Auth: basta con `providerId === "credential"`, sin mirar `password`.
export function hasPasswordCredential(
  authAccounts: { providerId: string }[],
): boolean {
  return authAccounts.some((account) => account.providerId === "credential");
}

function pendingInvitationWhere(token: string) {
  return {
    token,
    status: "INVITED" as const,
    acceptedAt: null,
    expiresAt: { gt: new Date() },
    membership: { deletedAt: null },
  };
}

// Lectura barata para no pagar el hash con un token ya inválido; no sustituye el `updateMany` de abajo, que es lo que hace el token de un solo uso.
export async function invitationIsPending(token: string): Promise<boolean> {
  const invitation = await getClient().userInvitation.findFirst({
    where: pendingInvitationWhere(token),
    select: { id: true },
  });

  return !!invitation;
}

// Debe llamarse dentro de una transacción: el `updateMany` condicional hace el token de un solo uso bajo READ COMMITTED (una segunda petición concurrente reevalúa el `WHERE` tras el commit de la primera y obtiene `count = 0`).
export async function claimPendingInvitation(token: string): Promise<string> {
  const client = getClient();

  const { count } = await client.userInvitation.updateMany({
    where: pendingInvitationWhere(token),
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  if (count !== 1) throw new BadRequest(INVALID_INVITATION_MESSAGE);

  const invitation = await client.userInvitation.findUniqueOrThrow({
    where: { token },
    select: { membership: { select: { userId: true } } },
  });

  return invitation.membership.userId;
}
