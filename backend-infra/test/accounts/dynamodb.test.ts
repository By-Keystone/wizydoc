import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountRepository } from "../../lib/src/accounts/infrastructure/persistence/dynamodb/account.repository";
import { capturingClient } from "../fakes";

const USER_ID = "01M6MSQWFCK15Q3X04AQEQ0S8Q";
const ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0S9R";
const TABLE_NAME = "MainTable";

test("la cuenta se lee por su clave con lectura consistente y sólo si es una cuenta", async () => {
  const found = capturingClient({
    response: {
      Item: { ItemType: "ACCOUNT", Id: ACCOUNT_ID, OwnerUserId: USER_ID },
    },
  });
  const otherType = capturingClient({
    response: {
      Item: { ItemType: "USER", Id: ACCOUNT_ID, OwnerUserId: USER_ID },
    },
  });
  const missing = capturingClient();

  assert.deepEqual(
    await new AccountRepository(found.client, TABLE_NAME).findById(ACCOUNT_ID),
    { id: ACCOUNT_ID, ownerUserId: USER_ID },
  );
  assert.equal(
    await new AccountRepository(otherType.client, TABLE_NAME).findById(
      ACCOUNT_ID,
    ),
    undefined,
  );
  assert.equal(
    await new AccountRepository(missing.client, TABLE_NAME).findById(
      ACCOUNT_ID,
    ),
    undefined,
  );
  assert.deepEqual(found.inputs, [
    {
      TableName: TABLE_NAME,
      Key: { PK: `ACCOUNT#${ACCOUNT_ID}`, SK: "!" },
      ProjectionExpression: "ItemType, Id, OwnerUserId",
      ConsistentRead: true,
    },
  ]);
});
