import type { IEmailService } from "@/application/ports/email-service.port";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import z from "zod";

export const sendPasswordResetEmailSchema = z.object({
  userId: z.uuid(),
  token: z.string().regex(/^[A-Za-z0-9]{24}$/),
});

export type SendPasswordResetEmailDto = z.infer<
  typeof sendPasswordResetEmailSchema
>;

interface SendPasswordResetEmailServices {
  emailService: IEmailService;
}

class FrontendUrlMissingError extends Error {
  name = "FrontendUrlMissing";
  message = "FRONTEND_URL no está configurada";
}

// Todo el fallo se atrapa aquí: Better Auth lo llama sin await y un rechazo
// sin atrapar tumbaría el proceso.
//
// Quién recibe qué (la pantalla es siempre la misma; solo cambia el correo):
// - Con contraseña: el de recuperación, esté o no confirmado y conserve o no sus
//   sedes. Quitar a alguien de sus sedes no le quita el login (la política exige
//   membership viva, no la contraseña), así que bloquear aquí no protegería nada.
// - Sin contraseña e invitación pendiente o vencida: "invitación pendiente".
//   Un token de recuperación le crearía una cuenta `credential` y se saltaría la
//   invitación.
// - Sin contraseña e invitación ya aceptada: el de recuperación; la invitación
//   ya se cumplió y crear la contraseña es la forma de entrar.
// - Sin contraseña y quitado de todas sus sedes: nada.
// Si algún día se puede desactivar o borrar usuarios, ese cambio también debe
// cortar la recuperación.
export class SendPasswordResetEmailUseCase {
  constructor(private readonly services: SendPasswordResetEmailServices) {}

  async execute(data: SendPasswordResetEmailDto) {
    try {
      const dto = sendPasswordResetEmailSchema.parse(data);
      const kind = await this.sendEmail(dto);
      if (kind) {
        console.log(
          `[password-reset]: correo ${kind} enviado al usuario ${dto.userId}`,
        );
      }
    } catch (error) {
      console.error(
        `[password-reset]: no se pudo enviar el correo al usuario ${data.userId}`,
        error instanceof FrontendUrlMissingError
          ? `${error.name}: ${error.message}`
          : error instanceof Error
            ? error.name
            : "UnknownError",
      );
    }
  }

  private async sendEmail(
    dto: SendPasswordResetEmailDto,
  ): Promise<"reset" | "pending-invitation" | null> {
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      throw new FrontendUrlMissingError();
    }

    const user = await this.findRecipient(dto.userId);
    if (!user) return null;

    const hasCredential = user.authaccounts.length > 0;
    const invitation = hasCredential
      ? null
      : await this.findInvitationToRemind(user.id);

    if (!hasCredential && !invitation) return null;

    if (invitation && !invitation.alreadyAccepted) {
      await this.sendPendingInvitationEmail(user, invitation, frontendUrl);
      return "pending-invitation";
    }

    await this.sendResetEmail(user, dto.token, frontendUrl);
    return "reset";
  }

  private async findRecipient(userId: string) {
    return await getClient().user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        authaccounts: {
          where: { providerId: "credential" },
          select: { id: true },
        },
      },
    });
  }

  private async findInvitationToRemind(userId: string) {
    const invitations = await getClient().userInvitation.findMany({
      where: { membership: { userId, deletedAt: null } },
      orderBy: { expiresAt: "desc" },
      select: {
        token: true,
        status: true,
        acceptedAt: true,
        expiresAt: true,
        membership: {
          select: {
            resource: {
              select: {
                clinic: { select: { name: true } },
                organization: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const latest = invitations[0];
    if (!latest) return null;

    // Una invitación aceptada sin contraseña solo existe en datos inconsistentes
    // (accept-invitation exige credencial). Ahí ya no hay nada que aceptar y
    // crear la contraseña es la forma de entrar: corresponde el correo normal.
    const alreadyAccepted = invitations.some(
      (invitation) =>
        invitation.status === "ACCEPTED" || invitation.acceptedAt !== null,
    );
    const isLive =
      latest.status === "INVITED" &&
      latest.acceptedAt === null &&
      latest.expiresAt > new Date();

    return {
      alreadyAccepted,
      inviteToken: isLive ? latest.token : null,
      resourceName:
        latest.membership.resource.clinic?.name ??
        latest.membership.resource.organization?.name ??
        "tu consultorio",
    };
  }

  // El token va en el fragmento: el navegador no lo manda al servidor ni en el
  // Referer, así que no queda en los logs de platform.
  private async sendResetEmail(
    user: { email: string; name: string },
    token: string,
    frontendUrl: string,
  ) {
    const url = new URL("/reset-password", frontendUrl);
    url.hash = `token=${token}`;

    const html = await renderTemplate("reset-password", {
      name: user.name,
      resetUrl: url.toString(),
    });

    await this.services.emailService.send({
      to: user.email,
      subject: "Crea tu contraseña nueva de WizyDoc",
      html,
    });
  }

  private async sendPendingInvitationEmail(
    user: { email: string; name: string },
    invitation: { inviteToken: string | null; resourceName: string },
    frontendUrl: string,
  ) {
    const html = await renderTemplate("pending-invitation", {
      name: user.name,
      resourceName: invitation.resourceName,
      inviteUrl: invitation.inviteToken
        ? `${frontendUrl}/invite/accept?token=${invitation.inviteToken}`
        : null,
    });

    await this.services.emailService.send({
      to: user.email,
      subject: "Tu invitación a WizyDoc sigue pendiente",
      html,
    });
  }
}
