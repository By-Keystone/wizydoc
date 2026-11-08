import { SendEmailCommand, type SESv2Client } from "@aws-sdk/client-sesv2";
import type { ISignUpEmails } from "../../../application/ports/sign-up-emails.port";
import {
  SIGN_UP_CODE_LIFETIME_MINUTES,
  type SignUpCode,
} from "../../../domain/sign-up-code.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";

export interface SignUpEmailTemplateNames {
  accountExists: string;
  signUpCode: string;
}

export interface SesSignUpEmailsSettings {
  fromAddress: string;
  frontendUrl: string;
  templates: SignUpEmailTemplateNames;
}

export class SesSignUpEmails implements ISignUpEmails {
  constructor(
    private readonly sesClient: SESv2Client,
    private readonly settings: SesSignUpEmailsSettings,
  ) {}

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
