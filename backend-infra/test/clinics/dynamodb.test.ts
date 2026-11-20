import assert from "node:assert/strict";
import { test } from "node:test";
import { ClinicRepository } from "../../lib/src/clinics/infrastructure/persistence/dynamodb/clinic.repository";
import { capturingClient } from "../fakes";

const CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0SAS";
const TABLE_NAME = "MainTable";

test("la sede se lee por su clave con lectura consistente y sólo si es una sede", async () => {
  const organizationId = "01M6MSQWFCK15Q3X04AQEQ0SCV";
  const found = capturingClient({
    response: { Item: { ItemType: "CLINIC", OrganizationId: organizationId } },
  });
  const otherType = capturingClient({
    response: {
      Item: { ItemType: "ORGANIZATION", OrganizationId: organizationId },
    },
  });
  const missing = capturingClient();

  assert.equal(
    await new ClinicRepository(found.client, TABLE_NAME).findOrganizationId(
      CLINIC_ID,
    ),
    organizationId,
  );
  assert.equal(
    await new ClinicRepository(otherType.client, TABLE_NAME).findOrganizationId(
      CLINIC_ID,
    ),
    undefined,
  );
  assert.equal(
    await new ClinicRepository(missing.client, TABLE_NAME).findOrganizationId(
      CLINIC_ID,
    ),
    undefined,
  );
  assert.deepEqual(found.inputs, [
    {
      TableName: TABLE_NAME,
      Key: { PK: `CLINIC#${CLINIC_ID}`, SK: "!" },
      ProjectionExpression: "#ItemType, #OrganizationId",
      ExpressionAttributeNames: {
        "#ItemType": "ItemType",
        "#OrganizationId": "OrganizationId",
      },
      ConsistentRead: true,
    },
  ]);
});
