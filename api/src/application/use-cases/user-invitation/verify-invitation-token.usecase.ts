import { BadRequest } from "@/application/errors/bad-request.errors";
import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import {
  hasPasswordCredential,
  invitationTokenSchema,
} from "./pending-invitation";

export const verifyInvitationTokenParamsSchema = z.object({
  token: invitationTokenSchema,
});

export type VerifyInvitationTokenDto = z.infer<
  typeof verifyInvitationTokenParamsSchema
>;

export class VerifyInvitationTokenUseCase {
  constructor() {}

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

    // EXPIRED o con la membership borrada se trata igual que un token inválido.
    if (invitation.status !== "INVITED" || invitation.membership.deletedAt) {
      throw new BadRequest("Token has expired");
    }

    if (invitation.expiresAt < new Date()) {
      await client.userInvitation.update({
        where: { token: data.token },
        data: { status: "EXPIRED" },
      });

      throw new BadRequest("Token has expired");
    }

    const user = invitation.membership.user;

    return {
      name: `${user.name} ${user.lastName}`,
      resourceName:
        invitation.membership.resource.clinic?.name ||
        invitation.membership.resource.organization?.name ||
        "[SIN-NOMBRE]",
      step: hasPasswordCredential(user.authaccounts)
        ? ("login" as const)
        : ("set_password" as const),
    };
  }
}
