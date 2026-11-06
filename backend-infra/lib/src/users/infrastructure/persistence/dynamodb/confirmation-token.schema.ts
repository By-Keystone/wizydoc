type PK = `EMAIL_CONFIRMATION#${string}`;
type SK = "!";

export const CONFIRMATION_TOKEN_ITEM_TYPE = "EMAIL_CONFIRMATION";

export interface ConfirmationTokenDynamoDBSchema {
  PK: PK;
  SK: SK;
  ItemType: typeof CONFIRMATION_TOKEN_ITEM_TYPE;
  UserId: string;
  ExpiresAt: number;
  DeleteAfter: number;
}

export const confirmationTokenPk = (tokenHash: string): PK =>
  `EMAIL_CONFIRMATION#${tokenHash}`;
export const confirmationTokenSk = (): SK => "!";
