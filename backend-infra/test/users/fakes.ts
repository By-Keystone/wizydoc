import type { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import type { SendEmailCommandInput, SESv2Client } from "@aws-sdk/client-sesv2";
import type { IAccountExistsNotices } from "../../lib/src/users/application/ports/account-exists-notices.port";
import type {
  ISessionProvider,
  Session,
  StartSessionInput,
} from "../../lib/src/users/application/ports/session-provider.port";
import type { ISignUpVerificationTokenRepository } from "../../lib/src/users/domain/repository/sign-up-verification-token.repository";
import type { VerificationToCommit } from "../../lib/src/users/domain/repository/user.repository";
import type { IIpRateLimit } from "../../lib/src/users/application/ports/ip-rate-limit.port";
import type {
  CreateUserIfAbsentInput,
  IIdentityProvider,
} from "../../lib/src/users/application/ports/identity-provider.port";
import type { ISignUpEmails } from "../../lib/src/users/application/ports/sign-up-emails.port";
import type { ISignUpCodeRepository } from "../../lib/src/users/domain/repository/sign-up-code.repository";
import {
  SIGN_UP_CODE_MAX_ATTEMPTS,
  type SignUpCode,
} from "../../lib/src/users/domain/sign-up-code.entity";
import type { SignUpVerificationToken } from "../../lib/src/users/domain/sign-up-verification-token.entity";
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
  accountExists: `${TEMPLATES_STACK_NAME}-account-exists`,
  signUpCode: `${TEMPLATES_STACK_NAME}-sign-up-code`,
};

export class InMemorySignUpVerificationTokens
  implements ISignUpVerificationTokenRepository
{
  private readonly tokens = new Map<string, SignUpVerificationToken>();

  add(verificationToken: SignUpVerificationToken): void {
    this.tokens.set(verificationToken.tokenHash, verificationToken);
  }

  async isValidFor(email: EmailVO, tokenHash: string): Promise<boolean> {
    return this.isUsable(email, tokenHash);
  }

  consume(email: EmailVO, tokenHash: string): boolean {
    if (!this.isUsable(email, tokenHash)) return false;
    this.tokens.delete(tokenHash);
    return true;
  }

  private isUsable(email: EmailVO, tokenHash: string): boolean {
    const stored = this.tokens.get(tokenHash);
    return stored?.email === email && stored.expiresAt.getTime() > Date.now();
  }
}

export class RecordingSessions implements ISessionProvider {
  readonly started: StartSessionInput[] = [];
  failure?: Error;

  async start(input: StartSessionInput): Promise<Session> {
    this.started.push(input);
    if (this.failure) throw this.failure;
    return {
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
    };
  }
}

export class InMemoryUsers implements IUserRepository {
  readonly users: User[];
  readonly createdUsers: User[] = [];
  readonly termsAcceptances: TermsAcceptance[] = [];
  failOnCreate = false;

  constructor(
    existingUsers: User[] = [],
    private readonly verificationTokens?: InMemorySignUpVerificationTokens,
  ) {
    this.users = [...existingUsers];
  }

  async createConfirmed(
    user: User,
    { email, tokenHash }: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean> {
    if (this.failOnCreate) throw new Error("DynamoDB no disponible");
    if (!this.verificationTokens?.consume(email, tokenHash)) return false;
    this.users.push(user);
    this.createdUsers.push(user);
    if (termsAcceptance) this.termsAcceptances.push(termsAcceptance);
    return true;
  }

  async existsByEmail(email: EmailVO): Promise<boolean> {
    return this.users.some((user) => user.email === email);
  }
}

export class InMemorySignUpCodes implements ISignUpCodeRepository {
  readonly saved: SignUpCode[] = [];
  readonly attemptsCounted: string[] = [];
  readonly verificationTokens: SignUpVerificationToken[] = [];
  private readonly current = new Map<string, SignUpCode>();

  isOnCooldown: boolean;

  constructor(isOnCooldown = false) {
    this.isOnCooldown = isOnCooldown;
  }

  async saveUnlessRequestedRecently(signUpCode: SignUpCode): Promise<boolean> {
    if (this.isOnCooldown) return false;
    this.saved.push(signUpCode);
    this.current.set(signUpCode.email, { ...signUpCode });
    return true;
  }

  async registerAttemptAndReadCodeHash(
    email: EmailVO,
  ): Promise<string | undefined> {
    const signUpCode = this.current.get(email);
    const canBeTried =
      signUpCode &&
      signUpCode.attempts < SIGN_UP_CODE_MAX_ATTEMPTS &&
      signUpCode.expiresAt.getTime() > Date.now();
    if (!canBeTried) return undefined;
    signUpCode.attempts += 1;
    this.attemptsCounted.push(email);
    return signUpCode.codeHash;
  }

  async spendForVerificationToken(
    email: EmailVO,
    codeHash: string,
    verificationToken: SignUpVerificationToken,
  ): Promise<boolean> {
    if (this.current.get(email)?.codeHash !== codeHash) return false;
    this.current.delete(email);
    this.verificationTokens.push(verificationToken);
    return true;
  }
}

export class InMemoryAccountExistsNotices implements IAccountExistsNotices {
  readonly registered: string[] = [];

  isOnCooldown: boolean;

  constructor(isOnCooldown = false) {
    this.isOnCooldown = isOnCooldown;
  }

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
    if (this.emailExists || this.createdEmails.includes(input.email)) {
      return undefined;
    }
    this.createdEmails.push(input.email);
    this.passwords.push(input.password);
    return this.createdEmails.length === 1
      ? COGNITO_SUB
      : `${COGNITO_SUB.slice(0, -1)}${this.createdEmails.length}`;
  }

  async deleteUser(cognitoSub: string): Promise<void> {
    if (this.failOnDelete) throw new Error("Cognito no disponible");
    this.deletedSubs.push(cognitoSub);
  }
}

export interface SentEmail {
  kind: "sign-up-code" | "account-exists";
  to: string;
  code?: string;
}

export class RecordingEmails implements ISignUpEmails {
  readonly sent: SentEmail[] = [];
  failOnSend = false;

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

export class AllowingFirstAttempts implements IIpRateLimit {
  readonly ipAddresses: (string | undefined)[] = [];

  constructor(private readonly allowedSends: number) {}

  async tryRegister(ipAddress: string | undefined): Promise<boolean> {
    this.ipAddresses.push(ipAddress);
    return this.ipAddresses.length <= this.allowedSends;
  }
}

export class CountingIpRateLimit implements IIpRateLimit {
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
  confirmed: true,
  onboardingCompleted: true,
  cognitoSub: COGNITO_SUB,
  ...overrides,
});

export interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

export const cognitoClient = (responses: Record<string, unknown>) => {
  const sent: SentCommand[] = [];
  const client = {
    send: async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      const name = command.constructor.name;
      sent.push({ name, input: command.input });
      const response = responses[name];
      if (response instanceof Error) throw response;
      return response ?? {};
    },
  } as unknown as CognitoIdentityProviderClient;
  return { client, sent };
};
