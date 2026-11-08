import type { SignUpCode } from "../sign-up-code.entity";
import type { SignUpVerificationToken } from "../sign-up-verification-token.entity";
import type { EmailVO } from "../value-objects/email.vo";

export interface ISignUpCodeRepository {
  saveUnlessRequestedRecently(signUpCode: SignUpCode): Promise<boolean>;
  registerAttemptAndReadCodeHash(email: EmailVO): Promise<string | undefined>;
  spendForVerificationToken(
    email: EmailVO,
    codeHash: string,
    verificationToken: SignUpVerificationToken,
  ): Promise<boolean>;
}
