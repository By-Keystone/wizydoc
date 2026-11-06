import { SendEmailCommand, type SESv2Client } from "@aws-sdk/client-sesv2";
import type { ISignUpEmails } from "../../../application/ports/sign-up-emails.port";
import type { ConfirmationToken } from "../../../domain/confirmation-token.entity";
import type { User } from "../../../domain/user.entity";
import {
  accountExistsMessage,
  confirmEmailMessage,
  type EmailMessage,
  pendingConfirmationMessage,
} from "../sign-up-messages";

const CHARSET = "UTF-8";

export interface SesSignUpEmailsSettings {
  fromAddress: string;
  frontendUrl: string;
}

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
      user.email,
      confirmEmailMessage({
        name: user.name,
        confirmUrl: this.confirmUrl(confirmationToken),
      }),
    );
  }

  async sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    await this.send(
      user.email,
      pendingConfirmationMessage({
        name: user.name,
        confirmUrl: this.confirmUrl(confirmationToken),
      }),
    );
  }

  async sendAccountExists(user: User): Promise<void> {
    await this.send(
      user.email,
      accountExistsMessage({
        name: user.name,
        loginUrl: this.frontendUrl("/login").href,
        forgotPasswordUrl: this.frontendUrl("/forgot-password").href,
      }),
    );
  }

  private confirmUrl(confirmationToken: ConfirmationToken): string {
    const confirmUrl = this.frontendUrl("/verify-email");
    confirmUrl.hash = `token=${confirmationToken.token}`;
    return confirmUrl.href;
  }

  private frontendUrl(path: string): URL {
    return new URL(path, this.settings.frontendUrl);
  }

  private async send(to: string, message: EmailMessage): Promise<void> {
    await this.sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: this.settings.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: CHARSET },
            Body: {
              Html: { Data: message.html, Charset: CHARSET },
              Text: { Data: message.text, Charset: CHARSET },
            },
          },
        },
      }),
    );
  }
}
