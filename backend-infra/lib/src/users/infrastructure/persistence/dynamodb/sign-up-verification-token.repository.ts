import { type DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { ISignUpVerificationTokenRepository } from "../../../domain/repository/sign-up-verification-token.repository";
import type { EmailVO } from "../../../domain/value-objects/email.vo";
import {
  SIGN_UP_VERIFICATION_ITEM_TYPE,
  signUpVerificationTokenPk,
  signUpVerificationTokenSk,
} from "./sign-up-verification-token.schema";

export class SignUpVerificationTokenRepository
  implements ISignUpVerificationTokenRepository
{
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async isValidFor(email: EmailVO, tokenHash: string): Promise<boolean> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: signUpVerificationTokenPk(tokenHash),
          SK: signUpVerificationTokenSk(),
        },
        ConsistentRead: true,
      }),
    );

    return (
      Item?.ItemType === SIGN_UP_VERIFICATION_ITEM_TYPE &&
      Item.Email === email &&
      Item.DeleteAfter > Math.floor(this.nowInMilliseconds() / 1000)
    );
  }
}
