import assert from "node:assert/strict";
import { test } from "node:test";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import { OnboardingRepository } from "../../lib/src/onboarding/infrastructure/persistence/dynamodb/onboarding.repository";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../lib/src/users/domain/value-objects/person-name.vo";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";
import { treatmentSchema } from "../../lib/src/users/domain/value-objects/treatment.vo";
import { capturingClient } from "../fakes";

const USER_ID = "01M6MSQWFCK15Q3X04AQEQ0S8Q";
const TABLE_NAME = "MainTable";

const personalData = {
  givenName: givenNameSchema.parse("Ana"),
  familyName: familyNameSchema.parse("Pérez"),
  phone: phoneSchema.parse("987654321"),
  treatment: treatmentSchema.parse("DRA"),
};

test("guardar Tus datos con PERSONAL_DATA guarda el nombre, el apellido, el celular con +51 y el tratamiento, y pasa el paso a PLAN", async () => {
  const { client, inputs } = capturingClient({
    response: { Attributes: { OnboardingStep: "PLAN" } },
  });

  const step = await new OnboardingRepository(
    client,
    TABLE_NAME,
  ).savePersonalData(USER_ID, personalData, {
    from: ["PERSONAL_DATA"],
    to: "PLAN",
  });

  assert.equal(step, "PLAN");
  const [update] = inputs as UpdateCommandInput[];
  assert.equal(update.TableName, TABLE_NAME);
  assert.deepEqual(update.Key, { PK: `USER#${USER_ID}`, SK: "!" });
  assert.equal(update.ConditionExpression, "#OnboardingStep IN (:from0)");
  assert.equal(
    update.UpdateExpression,
    "SET #OnboardingStep = :OnboardingStep, #GivenName = :GivenName, #FamilyName = :FamilyName, #Phone = :Phone, #Treatment = :Treatment",
  );
  assert.deepEqual(update.ExpressionAttributeValues, {
    ":from0": "PERSONAL_DATA",
    ":OnboardingStep": "PLAN",
    ":GivenName": "Ana",
    ":FamilyName": "Pérez",
    ":Phone": "+51987654321",
    ":Treatment": "DRA",
  });
  assert.deepEqual(update.ExpressionAttributeNames, {
    "#OnboardingStep": "OnboardingStep",
    "#GivenName": "GivenName",
    "#FamilyName": "FamilyName",
    "#Phone": "Phone",
    "#Treatment": "Treatment",
  });
  assert.equal(update.ReturnValues, "ALL_NEW");
});

test("savePersonalData sin paso de destino no toca OnboardingStep, y sin tratamiento guarda null", async () => {
  const { client, inputs } = capturingClient({
    response: { Attributes: { OnboardingStep: "CLINIC" } },
  });

  await new OnboardingRepository(client, TABLE_NAME).savePersonalData(
    USER_ID,
    { ...personalData, treatment: null },
    { from: ["PLAN", "CLINIC"] },
  );

  const [update] = inputs as UpdateCommandInput[];
  assert.equal(
    update.ConditionExpression,
    "#OnboardingStep IN (:from0, :from1)",
  );
  assert.equal(
    update.UpdateExpression,
    "SET #GivenName = :GivenName, #FamilyName = :FamilyName, #Phone = :Phone, #Treatment = :Treatment",
  );
  assert.deepEqual(update.ExpressionAttributeNames, {
    "#OnboardingStep": "OnboardingStep",
    "#GivenName": "GivenName",
    "#FamilyName": "FamilyName",
    "#Phone": "Phone",
    "#Treatment": "Treatment",
  });
  assert.equal(update.ExpressionAttributeValues?.[":Treatment"], null);
  assert.equal(
    update.ExpressionAttributeValues?.[":OnboardingStep"],
    undefined,
  );
});

test("savePersonalData devuelve undefined si otro pedido cambió el paso, y deja subir cualquier otro error", async () => {
  const lostRace = capturingClient({
    failure: new ConditionalCheckFailedException({
      message: "condición",
      $metadata: {},
    }),
  });
  const unavailable = capturingClient({ failure: new Error("sin red") });
  const transition = { from: ["PERSONAL_DATA"], to: "PLAN" } as const;

  assert.equal(
    await new OnboardingRepository(
      lostRace.client,
      TABLE_NAME,
    ).savePersonalData(USER_ID, personalData, transition),
    undefined,
  );
  await assert.rejects(
    new OnboardingRepository(unavailable.client, TABLE_NAME).savePersonalData(
      USER_ID,
      personalData,
      transition,
    ),
    /sin red/,
  );
});
