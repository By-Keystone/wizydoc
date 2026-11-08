import type { ConfirmationToken } from "../../domain/confirmation-token.entity";
import type { SignUpCode } from "../../domain/sign-up-code.entity";
import type { User } from "../../domain/user.entity";
import type { EmailVO } from "../../domain/value-objects/email.vo";

export interface ISignUpEmails {
  sendConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void>;
  sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void>;
  sendSignUpCode(signUpCode: SignUpCode): Promise<void>;
  sendAccountExists(email: EmailVO): Promise<void>;
}
