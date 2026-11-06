import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import { createConfirmationToken } from "../domain/confirmation-token.entity";
import type { IUserRepository } from "../domain/repository/user.repository";
import { emailSchema } from "../domain/value-objects/email.vo";
import type { ISignUpEmails } from "./ports/sign-up-emails.port";

export const resendConfirmationInputSchema = z.object(
  { email: emailSchema },
  { error: INVALID_REQUEST },
);

export type ResendConfirmationInput = z.output<
  typeof resendConfirmationInputSchema
>;

export class ResendConfirmationUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly emails: ISignUpEmails,
  ) {}

  async execute({ email }: ResendConfirmationInput): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.confirmed) return;

    const confirmationToken = createConfirmationToken(user.id);
    await this.users.saveConfirmationToken(confirmationToken);
    await this.emails.sendConfirmation(user, confirmationToken);
  }
}
