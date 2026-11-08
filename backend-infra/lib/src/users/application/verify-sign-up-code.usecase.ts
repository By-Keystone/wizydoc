import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import type { ISignUpCodeRepository } from "../domain/repository/sign-up-code.repository";
import { hashSignUpCode } from "../domain/sign-up-code.entity";
import { createSignUpVerificationToken } from "../domain/sign-up-verification-token.entity";
import { emailSchema } from "../domain/value-objects/email.vo";

const SIGN_UP_CODE_DIGITS = /^\d{6}$/;

export const INVALID_SIGN_UP_CODE =
  "El código no es correcto o ya venció. Pide uno nuevo si lo necesitas.";

export const verifySignUpCodeInputSchema = z.object(
  {
    email: emailSchema,
    code: z
      .string({ error: INVALID_SIGN_UP_CODE })
      .regex(SIGN_UP_CODE_DIGITS, { error: INVALID_SIGN_UP_CODE }),
  },
  { error: INVALID_REQUEST },
);

export type VerifySignUpCodeInput = z.output<
  typeof verifySignUpCodeInputSchema
>;

export class VerifySignUpCodeUseCase {
  constructor(private readonly signUpCodes: ISignUpCodeRepository) {}

  async execute({
    email,
    code,
  }: VerifySignUpCodeInput): Promise<string | undefined> {
    const storedCodeHash =
      await this.signUpCodes.registerAttemptAndReadCodeHash(email);
    if (storedCodeHash !== hashSignUpCode(code)) return undefined;

    const verificationToken = createSignUpVerificationToken(email);
    const wasSpent = await this.signUpCodes.spendForVerificationToken(
      email,
      storedCodeHash,
      verificationToken,
    );
    return wasSpent ? verificationToken.token : undefined;
  }
}
