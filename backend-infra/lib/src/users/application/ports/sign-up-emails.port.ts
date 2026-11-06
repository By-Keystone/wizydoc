import type { ConfirmationToken } from "../../domain/confirmation-token.entity";
import type { User } from "../../domain/user.entity";

export interface ISignUpEmails {
  sendConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void>;
  sendPendingConfirmation(
    user: User,
    confirmationToken: ConfirmationToken,
  ): Promise<void>;
  sendAccountExists(user: User): Promise<void>;
}
