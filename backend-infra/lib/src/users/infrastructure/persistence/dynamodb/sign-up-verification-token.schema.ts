type PK = `SIGN_UP_VERIFICATION#${string}`;
type SK = "!";

export const SIGN_UP_VERIFICATION_ITEM_TYPE = "SIGN_UP_VERIFICATION";

export interface SignUpVerificationTokenDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof SIGN_UP_VERIFICATION_ITEM_TYPE;
  Email: string;
  DeleteAfter: number;
}

export const signUpVerificationTokenPk = (tokenHash: string): PK =>
  `SIGN_UP_VERIFICATION#${tokenHash}`;
export const signUpVerificationTokenSk = (): SK => "!";
