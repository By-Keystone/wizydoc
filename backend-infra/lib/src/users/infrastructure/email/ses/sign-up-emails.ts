import { SendEmailCommand, type SESv2Client } from "@aws-sdk/client-sesv2";
import type { ISignUpEmails } from "../../../application/ports/sign-up-emails.port";
import {
  CONFIRMATION_TOKEN_LIFETIME_HOURS,
  type ConfirmationToken,
} from "../../../domain/confirmation-token.entity";
import type { User } from "../../../domain/user.entity";

export interface SignUpEmailTemplateNames {
  confirmEmail: string;
  pendingConfirmation: string;
  accountExists: string;
}

export interface SesSignUpEmailsSettings {
  fromAddress: string;
  frontendUrl: string;
  templates: SignUpEmailTemplateNames;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export class SesSignUpEmails implements ISignUpEmails {
  constructor(
    private readonly sesClient: SESv2Client,
    private readonly settings: SesSignUpEmailsSettings,
  ) {}

  async sendConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.send(
      user,
      this.settings.templates.confirmEmail,
      this.confirmationPlaceholders(confirmationToken),
    );
  }

  async sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.send(
      user,
      this.settings.templates.pendingConfirmation,
      this.confirmationPlaceholders(confirmationToken),
    );
  }

  async sendAccountExists(user: User): Promise<void> {
    await this.send(user, this.settings.templates.accountExists, {
      loginUrl: this.frontendUrl("/login").href,
      forgotPasswordUrl: this.frontendUrl("/forgot-password").href,
    });
  }

  private confirmationPlaceholders(
    confirmationToken: ConfirmationToken,
  ): Record<string, string> {
    const confirmUrl = this.frontendUrl("/verify-email");
    confirmUrl.hash = `token=${confirmationToken.token}`;
    return {
      confirmUrl: confirmUrl.href,
      linkLifetimeHours: String(CONFIRMATION_TOKEN_LIFETIME_HOURS),
    };
  }

  private frontendUrl(path: string): URL {
    return new URL(path, this.settings.frontendUrl);
  }

  private async send(
    user: User,
    templateName: string,
    placeholders: Record<string, string>,
  ): Promise<void> {
    await this.sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: this.settings.fromAddress,
        Destination: { ToAddresses: [user.email] },
        Content: {
          Template: {
            TemplateName: templateName,
            TemplateData: JSON.stringify({
              name: user.name,
              escapedName: escapeHtml(user.name),
              ...placeholders,
            }),
          },
        },
      }),
    );
  }
}
