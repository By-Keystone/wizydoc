import { z } from "zod";
import { errorName } from "../../shared/errors";
import { INVALID_REQUEST } from "../../shared/messages";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../domain/legal-documents";
import { type Account, createAccount } from "../domain/account.entity";
import type { ISignUpVerificationTokenRepository } from "../domain/repository/sign-up-verification-token.repository";
import type { IUserRepository } from "../domain/repository/user.repository";
import { hashSignUpVerificationToken } from "../domain/sign-up-verification-token.entity";
import { createTermsAcceptance } from "../domain/terms-acceptance.entity";
import { createUser } from "../domain/user.entity";
import { emailSchema } from "../domain/value-objects/email.vo";
import { passwordSchema } from "../domain/value-objects/password.vo";
import type { IIdentityProvider } from "./ports/identity-provider.port";
import type { ISessionProvider, Session } from "./ports/session-provider.port";

const TERMS_NOT_ACCEPTED =
  "Para crear tu cuenta, acepta los Términos y condiciones.";
const OUTDATED_TERMS =
  "Actualizamos los términos. Recarga la página para verlos.";

const termsAcceptanceInputShape = {
  acceptedTerms: z.literal(true, { error: TERMS_NOT_ACCEPTED }),
  termsVersion: z.literal(CURRENT_TERMS_VERSION, { error: OUTDATED_TERMS }),
  privacyPolicyVersion: z.literal(CURRENT_PRIVACY_POLICY_VERSION, {
    error: OUTDATED_TERMS,
  }),
};

const VERIFICATION_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export const VERIFICATION_EXPIRED =
  "Tu verificación venció. Vuelve a pedir el código.";

const confirmSignUpInputSchema = z.object(
  {
    email: emailSchema,
    password: passwordSchema,
    verificationToken: z
      .string({ error: VERIFICATION_EXPIRED })
      .regex(VERIFICATION_TOKEN_FORMAT, { error: VERIFICATION_EXPIRED }),
  },
  { error: INVALID_REQUEST },
);

const confirmSignUpWithTermsInputSchema = confirmSignUpInputSchema.extend(
  termsAcceptanceInputShape,
);

export type ConfirmSignUpInput = z.output<typeof confirmSignUpInputSchema>;

export const confirmSignUpInputSchemaFor = (
  requireTermsAcceptance: boolean,
): z.ZodType<ConfirmSignUpInput> =>
  requireTermsAcceptance
    ? confirmSignUpWithTermsInputSchema
    : confirmSignUpInputSchema;

export interface ConfirmSignUpRequest {
  input: ConfirmSignUpInput;
  ipAddress?: string;
  userAgent?: string;
}

export type ConfirmSignUpOutcome =
  | { kind: "verification-rejected" }
  | { kind: "created-with-session"; session: Session }
  | { kind: "created-without-session" };

const VERIFICATION_REJECTED: ConfirmSignUpOutcome = {
  kind: "verification-rejected",
};

export class ConfirmSignUpUseCase {
  constructor(
    private readonly verificationTokens: ISignUpVerificationTokenRepository,
    private readonly users: IUserRepository,
    private readonly identityProvider: IIdentityProvider,
    private readonly sessions: Pick<ISessionProvider, "start">,
    private readonly requireTermsAcceptance: boolean,
  ) {}

  async execute({
    input,
    ipAddress,
    userAgent,
  }: ConfirmSignUpRequest): Promise<ConfirmSignUpOutcome> {
    const { email, password, verificationToken } = input;
    const tokenHash = hashSignUpVerificationToken(verificationToken);

    if (!(await this.verificationTokens.isValidFor(email, tokenHash))) {
      return VERIFICATION_REJECTED;
    }
    if (await this.users.existsByEmail(email)) return VERIFICATION_REJECTED;

    const cognitoSub = await this.identityProvider.createUserIfAbsent({
      email,
      password,
    });
    if (!cognitoSub) {
      console.warn(
        "[confirm-sign-up] el correo existe en Cognito pero no en DynamoDB",
      );
      return VERIFICATION_REJECTED;
    }

    const newAccount = createAccount();
    const owner = createUser({ email, cognitoSub, accountId: newAccount.id });
    const account: Account = { ...newAccount, ownerUserId: owner.id };
    const termsAcceptance = this.requireTermsAcceptance
      ? createTermsAcceptance({
          userId: owner.id,
          email,
          ipAddress,
          userAgent,
        })
      : undefined;

    const wasCreated = await this.createOrRemoveIdentity(
      () =>
        this.users.createConfirmed(
          owner,
          account,
          { email, tokenHash },
          termsAcceptance,
        ),
      cognitoSub,
    );
    if (!wasCreated) return VERIFICATION_REJECTED;

    return this.startSession(cognitoSub, password);
  }

  private async createOrRemoveIdentity(
    create: () => Promise<boolean>,
    cognitoSub: string,
  ): Promise<boolean> {
    try {
      const wasCreated = await create();
      if (!wasCreated) await this.removeIdentity(cognitoSub);
      return wasCreated;
    } catch (error) {
      await this.removeIdentity(cognitoSub);
      throw error;
    }
  }

  private async removeIdentity(cognitoSub: string): Promise<void> {
    await this.identityProvider.deleteUser(cognitoSub).catch(() => {
      console.error(
        "[confirm-sign-up] quedó en Cognito un usuario sin su ítem en DynamoDB:",
        cognitoSub,
      );
    });
  }

  private async startSession(
    cognitoSub: string,
    password: string,
  ): Promise<ConfirmSignUpOutcome> {
    try {
      const session = await this.sessions.start({ cognitoSub, password });
      return { kind: "created-with-session", session };
    } catch (error) {
      console.error(
        "[confirm-sign-up] la cuenta quedó creada pero no se pudo iniciar la sesión:",
        errorName(error),
      );
      return { kind: "created-without-session" };
    }
  }
}
