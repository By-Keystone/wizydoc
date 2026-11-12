import { type DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { ULID } from "ulid";
import type { IClinicRepository } from "../../../domain/repository/clinic.repository";
import {
  CLINIC_ITEM_TYPE,
  clinicItemSchema,
  clinicPk,
  clinicSk,
} from "./clinic.schema";

export class ClinicRepository implements IClinicRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findOrganizationId(clinicId: string): Promise<ULID | undefined> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: clinicPk(clinicId), SK: clinicSk() },
        ProjectionExpression: "ItemType, OrganizationId",
        ConsistentRead: true,
      }),
    );

    if (Item?.ItemType !== CLINIC_ITEM_TYPE) return undefined;
    return clinicItemSchema.parse(Item).OrganizationId;
  }
}
