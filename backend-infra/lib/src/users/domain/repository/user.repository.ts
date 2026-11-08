import type { ConfirmationToken } from "../confirmation-token.entity";
import type { TermsAcceptance } from "../terms-acceptance.entity";
import type { User } from "../user.entity";
import type { EmailVO } from "../value-objects/email.vo";

export interface VerificationToCommit {
  email: EmailVO;
  tokenHash: string;
}

export interface IUserRepository {
  findByEmail(email: EmailVO): Promise<User | undefined>;
  existsByEmail(email: EmailVO): Promise<boolean>;
  create(
    user: User,
    confirmationToken: ConfirmationToken,
    termsAcceptance?: TermsAcceptance,
  ): Promise<void>;
  createConfirmed(
    user: User,
    verification: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean>;
  saveConfirmationToken(confirmationToken: ConfirmationToken): Promise<void>;
}
