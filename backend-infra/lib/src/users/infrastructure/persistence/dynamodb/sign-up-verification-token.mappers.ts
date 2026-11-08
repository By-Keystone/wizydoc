import type { SignUpVerificationToken } from "../../../domain/sign-up-verification-token.entity";
import { toEpochSeconds } from "./epoch-seconds";
import {
  SIGN_UP_VERIFICATION_ITEM_TYPE,
  type SignUpVerificationTokenDynamoDBSchema,
  signUpVerificationTokenPk,
  signUpVerificationTokenSk,
} from "./sign-up-verification-token.schema";

export const fromSignUpVerificationTokenToDynamo = (
  verificationToken: SignUpVerificationToken,
): SignUpVerificationTokenDynamoDBSchema => ({
  PK: signUpVerificationTokenPk(verificationToken.tokenHash),
  SK: signUpVerificationTokenSk(),
  ItemType: SIGN_UP_VERIFICATION_ITEM_TYPE,
  Email: verificationToken.email,
  DeleteAfter: toEpochSeconds(verificationToken.expiresAt),
});
