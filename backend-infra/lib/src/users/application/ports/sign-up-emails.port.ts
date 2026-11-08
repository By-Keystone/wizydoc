import type { SignUpCode } from "../../domain/sign-up-code.entity";
import type { EmailVO } from "../../domain/value-objects/email.vo";

export interface ISignUpEmails {
  sendSignUpCode(signUpCode: SignUpCode): Promise<void>;
  sendAccountExists(email: EmailVO): Promise<void>;
}
