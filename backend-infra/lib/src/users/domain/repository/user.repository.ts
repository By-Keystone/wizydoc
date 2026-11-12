import type { TermsAcceptance } from "../terms-acceptance.entity";
import type { UserWithAccount } from "../user.entity";
import type { EmailVO } from "../value-objects/email.vo";

export interface VerificationToCommit {
  email: EmailVO;
  tokenHash: string;
}

export interface IUserRepository {
  existsByEmail(email: EmailVO): Promise<boolean>;
  isConfirmed(cognitoSub: string): Promise<boolean>;
  createConfirmed(
    userWithAccount: UserWithAccount,
    verification: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean>;
}
