import type { SendEmailCommandInput, SESv2Client } from "@aws-sdk/client-sesv2";
import type { IAccountExistsNotices } from "../../lib/src/users/application/ports/account-exists-notices.port";
import type { IEmailSendAttempts } from "../../lib/src/users/application/ports/email-send-attempts.port";
import type {
  CreateUserIfAbsentInput,
  IIdentityProvider,
} from "../../lib/src/users/application/ports/identity-provider.port";
import type { ISignUpEmails } from "../../lib/src/users/application/ports/sign-up-emails.port";
import type { ISignUpCodeRepository } from "../../lib/src/users/domain/repository/sign-up-code.repository";
import type { SignUpCode } from "../../lib/src/users/domain/sign-up-code.entity";
import type { ConfirmationToken } from "../../lib/src/users/domain/confirmation-token.entity";
import type { IUserRepository } from "../../lib/src/users/domain/repository/user.repository";
import type { TermsAcceptance } from "../../lib/src/users/domain/terms-acceptance.entity";
import type { User } from "../../lib/src/users/domain/user.entity";
import {
  type EmailVO,
  emailSchema,
} from "../../lib/src/users/domain/value-objects/email.vo";
import { SesSignUpEmails } from "../../lib/src/users/infrastructure/email/ses/sign-up-emails";

export const COGNITO_SUB = "4b1c7a2e-0000-4000-8000-000000000001";
export const FROM_ADDRESS = "WizyDoc <no-reply@wizydoc.app>";
export const TEMPLATES_STACK_NAME = "Test";
export const TEMPLATE_NAMES = {
  confirmEmail: `${TEMPLATES_STACK_NAME}-confirm-email`,
  pendingConfirmation: `${TEMPLATES_STACK_NAME}-pending-confirmation`,
  accountExists: `${TEMPLATES_STACK_NAME}-account-exists`,
  signUpCode: `${TEMPLATES_STACK_NAME}-sign-up-code`,
};

export class InMemoryUsers implements IUserRepository {
  readonly users: User[];
  readonly createdUsers: User[] = [];
  readonly savedTokens: ConfirmationToken[] = [];
  readonly termsAcceptances: TermsAcceptance[] = [];
  failOnCreate = false;

  constructor(existingUsers: User[] = []) {
    this.users = [...existingUsers];
  }

  async existsByEmail(email: EmailVO): Promise<boolean> {
    return this.users.some((user) => user.email === email);
  }

  async findByEmail(email: EmailVO): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async create(
    user: User,
    confirmationToken: ConfirmationToken,
    termsAcceptance?: TermsAcceptance,
  ): Promise<void> {
    if (this.failOnCreate) throw new Error("DynamoDB no disponible");
    this.users.push(user);
    this.createdUsers.push(user);
    this.savedTokens.push(confirmationToken);
    if (termsAcceptance) this.termsAcceptances.push(termsAcceptance);
  }

  async saveConfirmationToken(
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    this.savedTokens.push(confirmationToken);
  }
}

export class InMemorySignUpCodes implements ISignUpCodeRepository {
  readonly saved: SignUpCode[] = [];

  constructor(private readonly isOnCooldown = false) {}

  async saveUnlessRequestedRecently(signUpCode: SignUpCode): Promise<boolean> {
    if (this.isOnCooldown) return false;
    this.saved.push(signUpCode);
    return true;
  }
}

export class InMemoryAccountExistsNotices implements IAccountExistsNotices {
  readonly registered: string[] = [];

  constructor(private readonly isOnCooldown = false) {}

  async tryRegister(email: EmailVO): Promise<boolean> {
    if (this.isOnCooldown) return false;
    this.registered.push(email);
    return true;
  }
}

export class InMemoryIdentityProvider implements IIdentityProvider {
  readonly createdEmails: string[] = [];
  readonly passwords: string[] = [];
  readonly deletedSubs: string[] = [];
  failOnDelete = false;

  constructor(private readonly emailExists = false) {}

  async createUserIfAbsent(
    input: CreateUserIfAbsentInput,
  ): Promise<string | undefined> {
    if (this.emailExists) return undefined;
    this.createdEmails.push(input.email);
    this.passwords.push(input.password);
    return COGNITO_SUB;
  }

  async deleteUser(cognitoSub: string): Promise<void> {
    if (this.failOnDelete) throw new Error("Cognito no disponible");
    this.deletedSubs.push(cognitoSub);
  }
}

export interface SentEmail {
  kind:
    | "confirmation"
    | "pending-confirmation"
    | "sign-up-code"
    | "account-exists";
  to: string;
  confirmationToken?: ConfirmationToken;
  code?: string;
}

export class RecordingEmails implements ISignUpEmails {
  readonly sent: SentEmail[] = [];
  failOnSend = false;

  async sendConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    if (this.failOnSend) throw new Error("SES no disponible");
    this.sent.push({ kind: "confirmation", to: user.email, confirmationToken });
  }

  async sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void> {
    if (this.failOnSend) throw new Error("SES no disponible");
    this.sent.push({
      kind: "pending-confirmation",
      to: user.email,
      confirmationToken,
    });
  }

  async sendSignUpCode({ email, code }: SignUpCode): Promise<void> {
    if (this.failOnSend) throw new Error("SES no disponible");
    this.sent.push({ kind: "sign-up-code", to: email, code });
  }

  async sendAccountExists(email: EmailVO): Promise<void> {
    if (this.failOnSend) throw new Error("SES no disponible");
    this.sent.push({ kind: "account-exists", to: email });
  }
}

export const capturingSes = () => {
  const inputs: SendEmailCommandInput[] = [];
  const sesClient = {
    send: async (command: { input: SendEmailCommandInput }) => {
      inputs.push(command.input);
      return {};
    },
  } as unknown as SESv2Client;
  return { sesClient, inputs };
};

export const emailsFor = (sesClient: SESv2Client) =>
  new SesSignUpEmails(sesClient, {
    fromAddress: FROM_ADDRESS,
    frontendUrl: "https://app.wizydoc.app/",
    templates: TEMPLATE_NAMES,
  });

export const templateDataOf = (
  input: SendEmailCommandInput,
): Record<string, string> =>
  JSON.parse(input.Content?.Template?.TemplateData ?? "{}");

export class CountingEmailSendAttempts implements IEmailSendAttempts {
  readonly ipAddresses: (string | undefined)[] = [];

  constructor(private readonly isAllowed = true) {}

  async tryRegister(ipAddress: string | undefined): Promise<boolean> {
    this.ipAddresses.push(ipAddress);
    return this.isAllowed;
  }
}

export const buildUser = (overrides: Partial<User> = {}): User => ({
  id: "01M6MSQWFCK15Q3X04AQEQ0S8Q",
  email: emailSchema.parse("ana@clinica.pe"),
  name: "Ana",
  lastName: "Pérez",
  phone: "+51987654321",
  confirmed: true,
  onboardingCompleted: true,
  cognitoSub: COGNITO_SUB,
  ...overrides,
});
