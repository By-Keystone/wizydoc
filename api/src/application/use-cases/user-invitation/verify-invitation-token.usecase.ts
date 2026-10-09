import { BadRequest } from "@/application/errors/bad-request.errors";
import { Gone } from "@/application/errors/gone.error";
import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// 64 hex: formato que genera `invite-user.usecase.ts`; rechazarlo aquí evita tocar la base con basura.
export const invitationTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { error: "Token inválido" });

const EXPIRED_INVITATION_MESSAGE =
  "Este link expiró. Pide al administrador que te envíe una invitación nueva.";

export const verifyInvitationTokenParamsSchema = z.object({
  token: invitationTokenSchema,
});

export type VerifyInvitationTokenDto = z.infer<
  typeof verifyInvitationTokenParamsSchema
>;

export class VerifyInvitationTokenUseCase {
  async execute(data: VerifyInvitationTokenDto) {
    const client = getClient();
    const invitation = await client.userInvitation.findUnique({
      include: {
        membership: {
          include: {
            resource: { include: { clinic: true, organization: true } },
            user: { include: { authaccounts: true } },
          },
        },
      },
      where: { token: data.token },
    });

    if (!invitation) {
      throw new NotFound("User has not been invited to this resource");
    }

    if (invitation.status === "ACCEPTED") {
      throw new UnprocessableEntity("User has already accepted the invite");
    }

    if (invitation.membership.deletedAt) {
      throw new BadRequest("Token has expired");
    }

    if (invitation.status === "EXPIRED")
      throw new Gone(EXPIRED_INVITATION_MESSAGE);

    if (invitation.expiresAt < new Date()) {
      await client.userInvitation.updateMany({
        where: { token: data.token, status: "INVITED" },
        data: { status: "EXPIRED" },
      });

      throw new Gone(EXPIRED_INVITATION_MESSAGE);
    }

    const user = invitation.membership.user;

    return {
      name: `${user.name} ${user.lastName}`,
      resourceName:
        invitation.membership.resource.clinic?.name ||
        invitation.membership.resource.organization?.name ||
        "[SIN-NOMBRE]",
      step: this.hasPasswordCredential(user.authaccounts)
        ? ("login" as const)
        : ("set_password" as const),
    };
  }

  // Igual que Better Auth: basta con `providerId === "credential"`, sin mirar `password`.
  private hasPasswordCredential(
    authAccounts: { providerId: string }[],
  ): boolean {
    return authAccounts.some((account) => account.providerId === "credential");
  }
}
