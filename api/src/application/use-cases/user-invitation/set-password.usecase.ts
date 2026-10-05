import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import auth from "@/infrastructure/vendors/auth/better-auth/auth";
import {
  claimPendingInvitation,
  hasPasswordCredential,
  INVALID_INVITATION_MESSAGE,
  invitationIsPending,
  invitationTokenSchema,
} from "./pending-invitation";

export const setPasswordSchema = z.object({
  token: invitationTokenSchema,
  password: z.string().min(8).max(128),
});

type SetPasswordDTO = z.infer<typeof setPasswordSchema>;

export class SetPasswordUseCase {
  constructor() {}

  async execute(data: SetPasswordDTO) {
    if (!(await invitationIsPending(data.token))) {
      throw new BadRequest(INVALID_INVITATION_MESSAGE);
    }

    // Hash fuera de la transacción: no retiene el bloqueo de fila mientras se calcula.
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(data.password);

    return await inTransaction(async () => {
      const userId = await claimPendingInvitation(data.token);

      // Serializa con otra invitación pendiente del mismo usuario: sin el bloqueo, dos podrían crear dos cuentas `credential` a la vez.
      await getClient().$queryRaw`
        SELECT id FROM "user" WHERE id = ${userId}::uuid FOR UPDATE
      `;

      const authAccounts = await getClient().authAccount.findMany({
        where: { userId },
        select: { providerId: true },
      });

      if (hasPasswordCredential(authAccounts)) {
        throw new UnprocessableEntity(
          "Ya tienes una contraseña. Inicia sesión para aceptar la invitación.",
        );
      }

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
}
