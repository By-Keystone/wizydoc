import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import type { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import type { SendEmailCommandInput, SESv2Client } from "@aws-sdk/client-sesv2";
import { BackendStack } from "../../lib/backend-stack";
import type { RoutePolicy } from "../../lib/src/users/application/authorize-request.usecase";
import type { Account } from "../../lib/src/users/domain/account.entity";
import type { IAccountExistsNotices } from "../../lib/src/users/application/ports/account-exists-notices.port";
import type {
  ISessionProvider,
  RefreshedSession,
  Session,
  SignInAttempt,
  SignInCredentials,
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
import type { PrivateApiGatewayEvent } from "../../lib/src/shared/http/api-gateway";
import type {
  Membership,
  NewMembership,
} from "../../lib/src/users/domain/membership.entity";
import type { IAccountRepository } from "../../lib/src/users/domain/repository/account.repository";
import type {
  IOnboardingRepository,
  OnboardingCompletion,
  OnboardingStepTransition,
} from "../../lib/src/users/domain/repository/onboarding.repository";
import type { IClinicRepository } from "../../lib/src/users/domain/repository/clinic.repository";
import type {
  IUserRepository,
  UserWithMemberships,
} from "../../lib/src/users/domain/repository/user.repository";
import type {
  Clinic,
  OwnerClinic,
} from "../../lib/src/users/domain/clinic.entity";
import type { Organization } from "../../lib/src/users/domain/organization.entity";
import type { Schedule } from "../../lib/src/users/domain/schedule.entity";
import type { Subscription } from "../../lib/src/users/domain/subscription.entity";
import type { TermsAcceptance } from "../../lib/src/users/domain/terms-acceptance.entity";
import type {
  OnboardingStep,
  PersonalData,
  User,
} from "../../lib/src/users/domain/user.entity";
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

export class RecordingSessions implements Pick<ISessionProvider, "start"> {
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
  readonly createdAccounts: Account[] = [];
  readonly memberships = new Map<string, Membership[]>();
  readonly termsAcceptances: TermsAcceptance[] = [];
  failOnCreate = false;
  failOnRead = false;

  constructor(
    existingUsers: User[] = [],
    private readonly verificationTokens?: InMemorySignUpVerificationTokens,
  ) {
    this.users = [...existingUsers];
  }

  async createConfirmed(
    user: User,
    account: Account,
    { email, tokenHash }: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean> {
    if (this.failOnCreate) throw new Error("DynamoDB no disponible");
    if (!this.verificationTokens?.consume(email, tokenHash)) return false;
    this.users.push(user);
    this.createdUsers.push(user);
    this.createdAccounts.push(account);
    if (termsAcceptance) this.termsAcceptances.push(termsAcceptance);
    return true;
  }

  async existsByEmail(email: EmailVO): Promise<boolean> {
    return this.users.some((user) => user.email === email);
  }

  async isConfirmed(cognitoSub: string): Promise<boolean> {
    if (this.failOnRead) throw new Error("DynamoDB no disponible");
    return this.users.some(
      (user) => user.cognitoSub === cognitoSub && user.confirmed,
    );
  }

  async findByCognitoSubWithMemberships(
    cognitoSub: string,
  ): Promise<UserWithMemberships | undefined> {
    if (this.failOnRead) throw new Error("DynamoDB no disponible");
    const user = this.users.find(
      (existing) => existing.cognitoSub === cognitoSub,
    );
    if (!user) return undefined;
    return { user, memberships: this.memberships.get(user.id) ?? [] };
  }
}

export class InMemoryOnboarding implements IOnboardingRepository {
  readonly transitions: OnboardingStepTransition[] = [];
  readonly subscriptions: Subscription[] = [];
  readonly organizations: Organization[] = [];
  readonly clinics: Clinic[] = [];
  readonly memberships: NewMembership[] = [];
  readonly schedules: Schedule[] = [];
  readonly completedAtByUserId = new Map<string, Date>();
  failOnWrite = false;
  beforeWrite?: () => void | Promise<void>;

  constructor(private readonly users: InMemoryUsers) {}

  async savePersonalData(
    userId: string,
    personalData: PersonalData,
    transition: OnboardingStepTransition,
  ): Promise<OnboardingStep | undefined> {
    if (this.failOnWrite) throw new Error("DynamoDB no disponible");
    this.beforeWrite?.();
    this.transitions.push(transition);
    const user = this.users.users.find(({ id }) => id === userId);
    if (!user || !transition.from.includes(user.onboardingStep)) {
      return undefined;
    }
    Object.assign(user, personalData);
    user.onboardingStep = transition.to ?? user.onboardingStep;
    return user.onboardingStep;
  }

  async savePlan(
    subscription: Subscription,
    userId: string,
    transition: OnboardingStepTransition,
  ): Promise<boolean> {
    if (this.failOnWrite) throw new Error("DynamoDB no disponible");
    this.beforeWrite?.();
    this.transitions.push(transition);
    const user = this.users.users.find(({ id }) => id === userId);
    const hasPlan = this.subscriptions.some(
      ({ accountId }) => accountId === subscription.accountId,
    );
    if (hasPlan || !user || !transition.from.includes(user.onboardingStep)) {
      return false;
    }
    this.subscriptions.push(subscription);
    user.onboardingStep = transition.to ?? user.onboardingStep;
    return true;
  }

  async createClinic(
    { ownerUserId, organization, clinic, memberships }: OwnerClinic,
    transition: Required<OnboardingStepTransition>,
  ): Promise<boolean> {
    if (this.failOnWrite) throw new Error("DynamoDB no disponible");
    await this.beforeWrite?.();
    this.transitions.push(transition);
    const user = this.users.users.find(({ id }) => id === ownerUserId);
    if (!user || !transition.from.includes(user.onboardingStep)) return false;
    this.organizations.push(organization);
    this.clinics.push(clinic);
    this.memberships.push(...memberships);
    this.users.memberships.set(user.id, [
      ...(this.users.memberships.get(user.id) ?? []),
      ...memberships,
    ]);
    user.onboardingStep = transition.to;
    return true;
  }

  async completeOnboarding(
    { userId, completedAt, schedule }: OnboardingCompletion,
    transition: Required<OnboardingStepTransition>,
  ): Promise<boolean> {
    if (this.failOnWrite) throw new Error("DynamoDB no disponible");
    this.beforeWrite?.();
    this.transitions.push(transition);
    const user = this.users.users.find(({ id }) => id === userId);
    if (!user || !transition.from.includes(user.onboardingStep)) return false;
    if (schedule) this.schedules.push(schedule);
    this.completedAtByUserId.set(userId, completedAt);
    user.onboardingStep = transition.to;
    return true;
  }
}

export class InMemoryAccounts implements IAccountRepository {
  readonly accounts: Account[] = [];

  async findById(accountId: string): Promise<Account | undefined> {
    return this.accounts.find((account) => account.id === accountId);
  }
}

export class InMemoryClinics implements IClinicRepository {
  readonly organizationIds = new Map<string, string>();
  reads = 0;

  async findOrganizationId(clinicId: string): Promise<string | undefined> {
    this.reads += 1;
    return this.organizationIds.get(clinicId);
  }
}

export const privateEvent = ({
  sub = COGNITO_SUB,
  resourceId,
  ...overrides
}: {
  sub?: unknown;
  resourceId?: string;
} & Partial<PrivateApiGatewayEvent> = {}): PrivateApiGatewayEvent => ({
  body: null,
  headers: {},
  pathParameters: resourceId ? { resourceId } : null,
  requestContext: { authorizer: { claims: { sub } } },
  ...overrides,
});

export class FakeClock {
  readonly waits: number[] = [];

  constructor(private current = Date.UTC(2026, 10, 9, 12, 0, 0)) {}

  now = (): number => this.current;

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  wait = async (milliseconds: number): Promise<void> => {
    this.waits.push(milliseconds);
    this.advance(milliseconds);
  };
}

interface CognitoAccount {
  cognitoSub: string;
  password: string;
}

const SESSION_EXPIRES_IN_SECONDS = 900;

export class InMemoryCognitoSessions
  implements Pick<ISessionProvider, "signIn" | "refresh" | "revoke">
{
  readonly usernames: string[] = [];
  readonly issuedRefreshTokens: string[] = [];
  readonly revokedRefreshTokens: string[] = [];
  failOnSignIn?: Error;
  readonly refreshedWith: string[] = [];
  failOnRevoke?: Error;
  failOnRefresh?: Error;
  unknownEmailLatency = 120;
  wrongPasswordLatency = 300;
  acceptedLatency = 500;
  revokeLatency = 200;
  private readonly accounts = new Map<string, CognitoAccount>();
  private readonly lockedOutEmails = new Set<string>();
  private readonly expiredRefreshTokens = new Set<string>();

  constructor(private readonly clock: FakeClock = new FakeClock()) {}

  addAccount(email: string, password: string, cognitoSub = COGNITO_SUB): void {
    this.accounts.set(email, { cognitoSub, password });
  }

  expire(refreshToken: string): void {
    this.expiredRefreshTokens.add(refreshToken);
  }

  lockOut(email: string): void {
    this.lockedOutEmails.add(email);
  }

  async signIn({ email, password }: SignInCredentials): Promise<SignInAttempt> {
    this.usernames.push(email);
    if (this.failOnSignIn) throw this.failOnSignIn;
    const account = this.accounts.get(email);
    if (account && this.lockedOutEmails.has(email)) {
      return { kind: "locked-out" };
    }
    if (!account) {
      this.clock.advance(this.unknownEmailLatency);
      return { kind: "rejected" };
    }
    if (account.password !== password) {
      this.clock.advance(this.wrongPasswordLatency);
      return { kind: "rejected" };
    }
    this.clock.advance(this.acceptedLatency);
    const refreshToken = `refresh-token-${this.issuedRefreshTokens.length + 1}`;
    this.issuedRefreshTokens.push(refreshToken);
    return {
      kind: "accepted",
      cognitoSub: account.cognitoSub,
      session: {
        idToken: "id-token",
        accessToken: "access-token",
        refreshToken,
        expiresIn: SESSION_EXPIRES_IN_SECONDS,
      },
    };
  }

  async refresh(refreshToken: string): Promise<RefreshedSession | undefined> {
    this.refreshedWith.push(refreshToken);
    if (this.failOnRefresh) throw this.failOnRefresh;
    const isValid =
      this.issuedRefreshTokens.includes(refreshToken) &&
      !this.revokedRefreshTokens.includes(refreshToken) &&
      !this.expiredRefreshTokens.has(refreshToken);
    if (!isValid) return undefined;
    return {
      idToken: "id-token-renovado",
      accessToken: "access-token-renovado",
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    this.clock.advance(this.revokeLatency);
    if (this.failOnRevoke) throw this.failOnRevoke;
    this.revokedRefreshTokens.push(refreshToken);
  }
}

export const idTokenFor = (sub: unknown): string =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub })).toString("base64url"),
    "firma",
  ].join(".");

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
  accountId: "01M6MSQWFCK15Q3X04AQEQ0S9R",
  onboardingStep: "COMPLETED",
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

export const readDeclaredPolicy = (functionName: string): RoutePolicy => {
  const stack = new BackendStack(
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
    "DeclaredPolicyTest",
    {
      env: { account: "111111111111", region: "us-east-2" },
      hostedZoneId: "Z0000000000000000000",
      zoneName: "wizydoc.app",
      apiDomainName: "api.wizydoc.app",
      frontendUrl: "https://app.wizydoc.app",
      emailFrom: "WizyDoc <no-reply@wizydoc.app>",
      termsAcceptanceRequired: false,
    },
  );
  const [routeFunction] = Object.entries(
    Template.fromStack(stack).findResources("AWS::Lambda::Function"),
  )
    .filter(([logicalId]) => logicalId.startsWith(functionName))
    .map(([, resource]) => resource);
  return JSON.parse(
    routeFunction.Properties.Environment.Variables.ROUTE_POLICY,
  );
};
