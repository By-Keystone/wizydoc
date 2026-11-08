import type { TermsAcceptance } from "../terms-acceptance.entity";
import type { User } from "../user.entity";
import type { EmailVO } from "../value-objects/email.vo";

export interface VerificationToCommit {
  email: EmailVO;
  tokenHash: string;
}

export interface IUserRepository {
  existsByEmail(email: EmailVO): Promise<boolean>;
  createConfirmed(
    user: User,
    verification: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean>;
}
