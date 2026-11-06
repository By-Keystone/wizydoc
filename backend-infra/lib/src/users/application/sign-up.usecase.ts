import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import {
  type ConfirmationToken,
  createConfirmationToken,
} from "../domain/confirmation-token.entity";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../domain/legal-documents";
import type { IUserRepository } from "../domain/repository/user.repository";
import {
  createTermsAcceptance,
  type TermsAcceptance,
} from "../domain/terms-acceptance.entity";
import { createUser, type User } from "../domain/user.entity";
import { emailSchema } from "../domain/value-objects/email.vo";
import { phoneSchema } from "../domain/value-objects/phone.vo";
import type { IIdentityProvider } from "./ports/identity-provider.port";
import type { ISignUpEmails } from "./ports/sign-up-emails.port";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 256;
const MAXIMUM_NAME_LENGTH = 100;
const PASSWORD_ACCEPTED_BY_COGNITO = /^\S(?:.*\S)?$/;
const PASSWORD_TOO_SHORT = `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres`;
const PASSWORD_WITH_SPACES_AT_THE_EDGES =
  "La contraseña no puede empezar ni terminar con un espacio, ni tener saltos de línea";
const TERMS_NOT_ACCEPTED =
  "Para crear tu cuenta, acepta los Términos y condiciones.";
const OUTDATED_TERMS =
  "Actualizamos los términos. Recarga la página para verlos.";

const countCharacters = (text: string): number => [...text].length;

const nameField = (missingMessage: string, tooLongMessage: string) =>
  z
    .string({ error: missingMessage })
    .trim()
    .min(1, { error: missingMessage })
    .max(MAXIMUM_NAME_LENGTH, { error: tooLongMessage });

export const signUpInputSchema = z.object(
  {
    email: emailSchema,
    name: nameField(
      "Ingresa tu nombre",
      `Escribe tu nombre en ${MAXIMUM_NAME_LENGTH} caracteres o menos`,
    ),
    lastName: nameField(
      "Ingresa tu apellido",
      `Escribe tu apellido en ${MAXIMUM_NAME_LENGTH} caracteres o menos`,
    ),
    phone: phoneSchema,
    password: z
      .string({ error: PASSWORD_TOO_SHORT })
      .refine(
        (password) => countCharacters(password) >= MINIMUM_PASSWORD_LENGTH,
        { error: PASSWORD_TOO_SHORT },
      )
      .max(MAXIMUM_PASSWORD_LENGTH, {
        error: `La contraseña puede tener hasta ${MAXIMUM_PASSWORD_LENGTH} caracteres`,
      })
      .regex(PASSWORD_ACCEPTED_BY_COGNITO, {
        error: PASSWORD_WITH_SPACES_AT_THE_EDGES,
      }),
  },
  { error: INVALID_REQUEST },
);

const signUpWithTermsInputSchema = signUpInputSchema.extend({
  acceptedTerms: z.literal(true, { error: TERMS_NOT_ACCEPTED }),
  termsVersion: z.literal(CURRENT_TERMS_VERSION, { error: OUTDATED_TERMS }),
  privacyPolicyVersion: z.literal(CURRENT_PRIVACY_POLICY_VERSION, {
    error: OUTDATED_TERMS,
  }),
});

export type SignUpInput = z.output<typeof signUpInputSchema>;

export const signUpInputSchemaFor = (
  requireTermsAcceptance: boolean,
): z.ZodType<SignUpInput> =>
  requireTermsAcceptance ? signUpWithTermsInputSchema : signUpInputSchema;

export interface SignUpRequest {
  input: SignUpInput;
  ipAddress?: string;
  userAgent?: string;
}

export class SignUpUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly identityProvider: IIdentityProvider,
    private readonly emails: ISignUpEmails,
    private readonly requireTermsAcceptance: boolean,
  ) {}

  async execute({ input, ipAddress, userAgent }: SignUpRequest): Promise<void> {
    const { email, name, lastName, phone, password } = input;

    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      await this.notifyExistingUser(existingUser);
      return;
    }

    const cognitoSub = await this.identityProvider.createUserIfAbsent({
      email,
      password,
    });
    if (!cognitoSub) {
      console.warn("[sign-up] el correo existe en Cognito pero no en DynamoDB");
      return;
    }

    const user = createUser({
      email,
      name,
      lastName,
      phone,
      cognitoSub,
      confirmed: false,
      onboardingCompleted: false,
    });
    const confirmationToken = createConfirmationToken(user.id);
    const termsAcceptance = this.requireTermsAcceptance
      ? createTermsAcceptance({ userId: user.id, email, ipAddress, userAgent })
      : undefined;

    await this.saveOrRemoveIdentity(
      user,
      confirmationToken,
      termsAcceptance,
      cognitoSub,
    );
    await this.emails.sendConfirmation(user, confirmationToken);
  }

  private async notifyExistingUser(user: User): Promise<void> {
    if (user.confirmed) {
      await this.emails.sendAccountExists(user);
      return;
    }

    const confirmationToken = createConfirmationToken(user.id);
    await this.users.saveConfirmationToken(confirmationToken);
    await this.emails.sendPendingConfirmation(user, confirmationToken);
  }

  private async saveOrRemoveIdentity(
    user: User,
    confirmationToken: ConfirmationToken,
    termsAcceptance: TermsAcceptance | undefined,
    cognitoSub: string,
  ): Promise<void> {
    try {
      await this.users.create(user, confirmationToken, termsAcceptance);
    } catch (error) {
      await this.identityProvider.deleteUser(cognitoSub).catch(() => {
        console.error(
          "[sign-up] quedó en Cognito un usuario sin su ítem en DynamoDB:",
          cognitoSub,
        );
      });
      throw error;
    }
  }
}
