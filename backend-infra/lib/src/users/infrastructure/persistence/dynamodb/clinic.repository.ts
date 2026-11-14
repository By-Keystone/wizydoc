import { type DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { ULID } from "ulid";
import type { IClinicRepository } from "../../../domain/repository/clinic.repository";
import {
  CLINIC_ITEM_TYPE,
  type ClinicDynamoDBSchema,
  clinicPk,
  clinicSk,
} from "./clinic.schema";

export class ClinicRepository implements IClinicRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findOrganizationId(clinicId: ULID): Promise<ULID | undefined> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: clinicPk(clinicId), SK: clinicSk() },
        ProjectionExpression: "#ItemType, #OrganizationId",
        ExpressionAttributeNames: {
          "#ItemType": "ItemType",
          "#OrganizationId": "OrganizationId",
        },
        ConsistentRead: true,
      }),
    );

    const clinicItem = Item as
      | Pick<ClinicDynamoDBSchema, "ItemType" | "OrganizationId">
      | undefined;
    if (clinicItem?.ItemType !== CLINIC_ITEM_TYPE) return undefined;
    return clinicItem.OrganizationId;
  }
}
