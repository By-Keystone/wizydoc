import type { Membership } from "../membership.entity";
import type { TermsAcceptance } from "../terms-acceptance.entity";
import type { User, UserWithAccount } from "../user.entity";
import type { EmailVO } from "../value-objects/email.vo";

export interface VerificationToCommit {
  email: EmailVO;
  tokenHash: string;
}

export interface UserWithMemberships {
  user: User;
  memberships: Membership[];
}

export interface IUserRepository {
  existsByEmail(email: EmailVO): Promise<boolean>;
  isConfirmed(cognitoSub: string): Promise<boolean>;
  findByCognitoSubWithMemberships(
    cognitoSub: string,
  ): Promise<UserWithMemberships | undefined>;
  createConfirmed(
    userWithAccount: UserWithAccount,
    verification: VerificationToCommit,
    termsAcceptance?: TermsAcceptance,
  ): Promise<boolean>;
}
