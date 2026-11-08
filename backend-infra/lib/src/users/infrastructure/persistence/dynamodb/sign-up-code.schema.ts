type PK = `SIGN_UP_CODE#${string}`;
type SK = "!";

export const SIGN_UP_CODE_ITEM_TYPE = "SIGN_UP_CODE";

export interface SignUpCodeDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof SIGN_UP_CODE_ITEM_TYPE;
  CodeHash: string;
  Attempts: number;
  DeleteAfter: number;
}

export const signUpCodePk = (email: string): PK => `SIGN_UP_CODE#${email}`;
export const signUpCodeSk = (): SK => "!";
