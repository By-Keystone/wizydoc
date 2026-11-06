import type { ConfirmationToken } from "../../../domain/confirmation-token.entity";
import {
  CONFIRMATION_TOKEN_ITEM_TYPE,
  type ConfirmationTokenDynamoDBSchema,
  confirmationTokenPk,
  confirmationTokenSk,
} from "./confirmation-token.schema";

const toEpochSeconds = (date: Date): number =>
  Math.floor(date.getTime() / 1000);

export const fromConfirmationTokenToDynamo = (
  confirmationToken: ConfirmationToken,
): ConfirmationTokenDynamoDBSchema => {
  const expiresAt = toEpochSeconds(confirmationToken.expiresAt);
  return {
    PK: confirmationTokenPk(confirmationToken.tokenHash),
    SK: confirmationTokenSk(),
    ItemType: CONFIRMATION_TOKEN_ITEM_TYPE,
    UserId: confirmationToken.userId,
    ExpiresAt: expiresAt,
    DeleteAfter: expiresAt,
  };
};
