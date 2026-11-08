import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { IAccountExistsNotices } from "../../../application/ports/account-exists-notices.port";
import { SIGN_UP_EMAIL_COOLDOWN_SECONDS } from "../../../domain/sign-up-code.entity";
import type { EmailVO } from "../../../domain/value-objects/email.vo";

const SIGN_UP_NOTICE_ITEM_TYPE = "SIGN_UP_NOTICE";
const ONLY_IF_NOT_SENT_RECENTLY =
  "attribute_not_exists(PK) OR DeleteAfter <= :now";

export class DynamoDBAccountExistsNotices implements IAccountExistsNotices {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly nowInMilliseconds: () => number = Date.now,
  ) {}

  async tryRegister(email: EmailVO): Promise<boolean> {
    const nowInSeconds = Math.floor(this.nowInMilliseconds() / 1000);

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `SIGN_UP_NOTICE#${email}`,
            SK: "!",
            ItemType: SIGN_UP_NOTICE_ITEM_TYPE,
            DeleteAfter: nowInSeconds + SIGN_UP_EMAIL_COOLDOWN_SECONDS,
          },
          ConditionExpression: ONLY_IF_NOT_SENT_RECENTLY,
          ExpressionAttributeValues: { ":now": nowInSeconds },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
