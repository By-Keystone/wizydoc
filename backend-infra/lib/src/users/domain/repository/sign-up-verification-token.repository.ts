import type { EmailVO } from "../value-objects/email.vo";

export interface ISignUpVerificationTokenRepository {
  isValidFor(email: EmailVO, tokenHash: string): Promise<boolean>;
}
