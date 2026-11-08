import type { SignUpCode } from "../sign-up-code.entity";

export interface ISignUpCodeRepository {
  saveUnlessRequestedRecently(signUpCode: SignUpCode): Promise<boolean>;
}
