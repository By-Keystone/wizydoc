import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import type { ISignUpCodeRepository } from "../domain/repository/sign-up-code.repository";
import type { IUserRepository } from "../domain/repository/user.repository";
import { createSignUpCode } from "../domain/sign-up-code.entity";
import { emailSchema } from "../domain/value-objects/email.vo";
import type { IAccountExistsNotices } from "./ports/account-exists-notices.port";
import type { ISignUpEmails } from "./ports/sign-up-emails.port";

export const requestSignUpCodeInputSchema = z.object(
  { email: emailSchema },
  { error: INVALID_REQUEST },
);

export type RequestSignUpCodeInput = z.output<
  typeof requestSignUpCodeInputSchema
>;

export class RequestSignUpCodeUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly signUpCodes: ISignUpCodeRepository,
    private readonly accountExistsNotices: IAccountExistsNotices,
    private readonly emails: ISignUpEmails,
  ) {}

  async execute({ email }: RequestSignUpCodeInput): Promise<void> {
    if (await this.users.existsByEmail(email)) {
      if (await this.accountExistsNotices.tryRegister(email)) {
        await this.emails.sendAccountExists(email);
      }
      return;
    }

    const signUpCode = createSignUpCode(email);
    const wasSaved =
      await this.signUpCodes.saveUnlessRequestedRecently(signUpCode);
    if (!wasSaved) return;

    await this.emails.sendSignUpCode(signUpCode);
  }
}
