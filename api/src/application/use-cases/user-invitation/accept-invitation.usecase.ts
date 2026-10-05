import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import {
  claimPendingInvitation,
  hasPasswordCredential,
  invitationTokenSchema,
} from "./pending-invitation";

const SET_PASSWORD_FIRST_MESSAGE =
  "Primero define tu contraseña desde el enlace de invitación";

export const acceptInvitationParamsSchema = z.object({
  token: invitationTokenSchema,
});

type AcceptInvitationDto = z.infer<typeof acceptInvitationParamsSchema>;

export class AcceptInvitationUseCase {
  constructor() {}

  async execute(data: AcceptInvitationDto) {
    return await inTransaction(async () => {
      const userId = await claimPendingInvitation(data.token);

      const authAccounts = await getClient().authAccount.findMany({
        where: { userId },
        select: { providerId: true },
      });

      // Si no tiene contraseña, la transacción se revierte: el token no se consume y debe usar `set-password`.
      if (!hasPasswordCredential(authAccounts)) {
        throw new UnprocessableEntity(SET_PASSWORD_FIRST_MESSAGE);
      }

      return { step: "login" as const };
    });
  }
}
