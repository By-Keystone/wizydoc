import type { SignUpCode } from "../../../domain/sign-up-code.entity";
import { toEpochSeconds } from "./epoch-seconds";
import {
  SIGN_UP_CODE_ITEM_TYPE,
  type SignUpCodeDynamoDBSchema,
  signUpCodePk,
  signUpCodeSk,
} from "./sign-up-code.schema";

export const fromSignUpCodeToDynamo = (
  signUpCode: SignUpCode,
): SignUpCodeDynamoDBSchema => ({
  PK: signUpCodePk(signUpCode.email),
  SK: signUpCodeSk(),
  ItemType: SIGN_UP_CODE_ITEM_TYPE,
  CodeHash: signUpCode.codeHash,
  Attempts: signUpCode.attempts,
  DeleteAfter: toEpochSeconds(signUpCode.expiresAt),
});
