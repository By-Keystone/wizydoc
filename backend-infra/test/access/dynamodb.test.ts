import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DynamoDBDocumentClient,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { SessionRepository } from "../../lib/src/access/infrastructure/persistence/dynamodb/session.repository";
import { COGNITO_SUB } from "../fakes";

const USER_ID = "01M6MSQWFCK15Q3X04AQEQ0S8Q";
const ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0S9R";
const CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0SAS";

const userItem = {
  ItemType: "USER",
  Id: USER_ID,
  Email: "ana@clinica.pe",
  Confirmed: true,
  AccountId: ACCOUNT_ID,
  OnboardingStep: "COMPLETED",
  CognitoSub: COGNITO_SUB,
};
const membershipItem = {
  ItemType: "MEMBERSHIP",
  ResourceId: CLINIC_ID,
  ResourceType: "CLINIC",
  AccountId: ACCOUNT_ID,
  Role: "DOCTOR",
};

const TABLE_NAME = "MainTable";

const sessionClient = (...responses: unknown[]) => {
  const inputs: unknown[] = [];
  const client = {
    send: async (command: { input: unknown }) => {
      inputs.push(command.input);
      return responses.shift();
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, inputs };
};

const findSession = (...responses: unknown[]) => {
  const { client, inputs } = sessionClient(...responses);
  const found = new SessionRepository(
    client,
    TABLE_NAME,
  ).findByCognitoSubWithMemberships(COGNITO_SUB);
  return { found, inputs };
};

const sessionResponses = (partition: unknown) => [
  { Items: [{ ItemType: "USER", Id: USER_ID }] },
  partition,
];

test("el usuario de la sesión y sus memberships se leen sólo de su propia partición", async () => {
  const { found, inputs } = findSession(
    ...sessionResponses({ Items: [userItem, membershipItem] }),
  );

  const session = await found;

  assert.equal(session?.user.id, USER_ID);
  assert.equal(session?.user.accountId, ACCOUNT_ID);
  assert.equal(session?.user.onboardingStep, "COMPLETED");
  assert.deepEqual(session?.memberships, [
    {
      resourceId: CLINIC_ID,
      resourceType: "CLINIC",
      accountId: ACCOUNT_ID,
      role: "DOCTOR",
    },
  ]);
  const [index, partition] = inputs as {
    IndexName?: string;
    ProjectionExpression: string;
    ConsistentRead?: boolean;
    FilterExpression?: string;
    KeyConditionExpression?: string;
    Limit?: number;
    ExpressionAttributeNames: Record<string, string>;
    ExpressionAttributeValues: Record<string, unknown>;
  }[];
  assert.equal(index.IndexName, "GSI2");
  assert.equal(index.ProjectionExpression, "#ItemType, #Id");
  assert.equal(index.Limit, 1);
  assert.equal(index.KeyConditionExpression, "#GSI2PK = :gsi2pk");
  assert.equal(index.ExpressionAttributeNames["#GSI2PK"], "GSI2PK");
  assert.equal(
    index.ExpressionAttributeValues[":gsi2pk"],
    `COGNITO#${COGNITO_SUB}`,
  );
  assert.equal(partition.IndexName, undefined);
  assert.equal(partition.ConsistentRead, true);
  assert.equal(partition.KeyConditionExpression, "#PK = :pk");
  assert.equal(partition.ExpressionAttributeNames["#PK"], "PK");
  assert.equal(partition.FilterExpression, "#ItemType IN (:user, :membership)");
  assert.deepEqual(partition.ExpressionAttributeValues, {
    ":pk": `USER#${USER_ID}`,
    ":user": "USER",
    ":membership": "MEMBERSHIP",
  });
});

test("la partición del usuario se lee sin nada más que lo que piden la policy y /api/me", async () => {
  const { found, inputs } = findSession(
    ...sessionResponses({ Items: [userItem] }),
  );
  await found;

  const [, partition] = inputs as {
    ProjectionExpression: string;
    ExpressionAttributeNames: Record<string, string>;
  }[];
  const projected = partition.ProjectionExpression.split(", ").map(
    (name) => partition.ExpressionAttributeNames[name],
  );
  assert.deepEqual(projected, [
    "ItemType",
    "Id",
    "Email",
    "Confirmed",
    "AccountId",
    "OnboardingStep",
    "CognitoSub",
    "GivenName",
    "FamilyName",
    "Phone",
    "Treatment",
    "ResourceId",
    "ResourceType",
    "Role",
  ]);
});

test("la lectura de la sesión trae el nombre, el apellido, el celular y el tratamiento del usuario", async () => {
  const withPersonalData = {
    ...userItem,
    GivenName: "Ana",
    FamilyName: "Pérez",
    Phone: "+51987654321",
    Treatment: "DRA",
  };
  const withoutTreatment = { ...withPersonalData, Treatment: null };

  const session = await findSession(
    ...sessionResponses({ Items: [withPersonalData] }),
  ).found;
  const sessionWithoutTreatment = await findSession(
    ...sessionResponses({ Items: [withoutTreatment] }),
  ).found;
  const sessionWithoutData = await findSession(
    ...sessionResponses({ Items: [userItem] }),
  ).found;

  assert.equal(session?.user.givenName, "Ana");
  assert.equal(session?.user.familyName, "Pérez");
  assert.equal(session?.user.phone, "+51987654321");
  assert.equal(session?.user.treatment, "DRA");
  assert.equal(sessionWithoutTreatment?.user.treatment, null);
  assert.equal(sessionWithoutData?.user.givenName, undefined);
  assert.equal(sessionWithoutData?.user.treatment, undefined);
});

test("sin un usuario en el índice, en la partición o con otro CognitoSub, no hay usuario", async () => {
  const withoutIndexItem = findSession({ Items: [] });
  const indexItemOfOtherType = findSession({
    Items: [{ ItemType: "PATIENT", Id: USER_ID }],
  });
  const partitionWithoutUser = findSession(
    ...sessionResponses({ Items: [membershipItem] }),
  );
  const userOfOtherSub = findSession(
    ...sessionResponses({
      Items: [{ ...userItem, CognitoSub: "otro-sub" }, membershipItem],
    }),
  );

  assert.equal(await withoutIndexItem.found, undefined);
  assert.equal(await indexItemOfOtherType.found, undefined);
  assert.equal(await partitionWithoutUser.found, undefined);
  assert.equal(await userOfOtherSub.found, undefined);
  assert.equal(withoutIndexItem.inputs.length, 1);
  assert.equal(indexItemOfOtherType.inputs.length, 1);
});

test("un ítem de otro tipo en la partición no se mapea como membership", async () => {
  const session = await findSession(
    ...sessionResponses({
      Items: [userItem, { ...membershipItem, ItemType: "TERMS_ACCEPTANCE" }],
    }),
  ).found;

  assert.deepEqual(session?.memberships, []);
});

test("una partición de más de una página se lee completa, página por página", async () => {
  const lastEvaluatedKey = { PK: `USER#${USER_ID}`, SK: "!" };
  const { found, inputs } = findSession(
    ...sessionResponses({
      Items: [userItem],
      LastEvaluatedKey: lastEvaluatedKey,
    }),
    { Items: [membershipItem] },
  );

  const session = await found;

  assert.equal(session?.user.id, USER_ID);
  assert.equal(session?.memberships.length, 1);
  const [, firstPage, secondPage] = inputs as QueryCommandInput[];
  assert.equal(firstPage.ExclusiveStartKey, undefined);
  assert.deepEqual(secondPage.ExclusiveStartKey, lastEvaluatedKey);
  assert.equal(
    secondPage.KeyConditionExpression,
    firstPage.KeyConditionExpression,
  );
});
