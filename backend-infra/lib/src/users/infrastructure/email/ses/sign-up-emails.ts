import { SendEmailCommand, type SESv2Client } from "@aws-sdk/client-sesv2";
import type { ISignUpEmails } from "../../../application/ports/sign-up-emails.port";
import {
  CONFIRMATION_TOKEN_LIFETIME_HOURS,
  type ConfirmationToken,
} from "../../../domain/confirmation-token.entity";
import {
  SIGN_UP_CODE_LIFETIME_MINUTES,
  type SignUpCode,
} from "../../../domain/sign-up-code.entity";
import type { User } from "../../../domain/user.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";

export interface SignUpEmailTemplateNames {
  confirmEmail: string;
  pendingConfirmation: string;
  accountExists: string;
  signUpCode: string;
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

const namePlaceholders = (user: User) => ({
  name: user.name ?? "",
  escapedName: escapeHtml(user.name ?? ""),
});

export class SesSignUpEmails implements ISignUpEmails {
  constructor(
    private readonly sesClient: SESv2Client,
    private readonly settings: SesSignUpEmailsSettings,
  ) {}

  async sendConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.send(user.email, this.settings.templates.confirmEmail, {
      ...namePlaceholders(user),
      ...this.confirmationPlaceholders(confirmationToken),
    });
  }

  async sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.send(user.email, this.settings.templates.pendingConfirmation, {
      ...namePlaceholders(user),
      ...this.confirmationPlaceholders(confirmationToken),
    });
  }

  async sendSignUpCode({ email, code }: SignUpCode): Promise<void> {
    await this.send(email, this.settings.templates.signUpCode, {
      code,
      codeLifetimeMinutes: String(SIGN_UP_CODE_LIFETIME_MINUTES),
    });
  }

  async sendAccountExists(email: EmailVO): Promise<void> {
    await this.send(email, this.settings.templates.accountExists, {
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
    to: EmailVO,
    templateName: string,
    placeholders: Record<string, string>,
  ): Promise<void> {
    await this.sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: this.settings.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: {
          Template: {
            TemplateName: templateName,
            TemplateData: JSON.stringify(placeholders),
          },
        },
      }),
    );
  }
}
