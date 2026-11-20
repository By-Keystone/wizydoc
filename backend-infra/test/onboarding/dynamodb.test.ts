import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import type {
  TransactWriteCommandInput,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { createOwnerClinic } from "../../lib/src/clinics/domain/clinic.entity";
import { weeklyScheduleSchema } from "../../lib/src/clinics/domain/value-objects/weekly-schedule.vo";
import { createSubscription } from "../../lib/src/accounts/domain/subscription.entity";
import { OnboardingRepository } from "../../lib/src/onboarding/infrastructure/persistence/dynamodb/onboarding.repository";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../lib/src/users/domain/value-objects/person-name.vo";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";
import { treatmentSchema } from "../../lib/src/users/domain/value-objects/treatment.vo";
import { capturingClient } from "../fakes";

const USER_ID = "01M6MSQWFCK15Q3X04AQEQ0S8Q";
const ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0S9R";
const CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0SAS";
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

const planSubscription = createSubscription(
  { accountId: ACCOUNT_ID, plan: "FREE" },
  new Date("2026-11-12T15:00:00.000Z"),
);

test("guardar Tu plan con FREE crea el plan de la cuenta, indexado por plan, y pasa el paso a CLINIC en la misma transacción", async () => {
  const { client, inputs } = capturingClient();

  const saved = await new OnboardingRepository(client, TABLE_NAME).savePlan(
    planSubscription,
    USER_ID,
    { from: ["PLAN"], to: "CLINIC" },
  );

  assert.equal(saved, true);
  const [transaction] = inputs as TransactWriteCommandInput[];
  assert.deepEqual(transaction.TransactItems, [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `ACCOUNT#${ACCOUNT_ID}`,
          SK: "SUBSCRIPTION",
          ItemType: "SUBSCRIPTION",
          Plan: "FREE",
          CreatedAt: "2026-11-12T15:00:00.000Z",
          GSI1PK: "PLAN#FREE",
          GSI1SK: `ACCOUNT#${ACCOUNT_ID}`,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      },
    },
    {
      Update: {
        TableName: TABLE_NAME,
        Key: { PK: `USER#${USER_ID}`, SK: "!" },
        ConditionExpression: "#OnboardingStep IN (:from0)",
        UpdateExpression: "SET #OnboardingStep = :OnboardingStep",
        ExpressionAttributeNames: { "#OnboardingStep": "OnboardingStep" },
        ExpressionAttributeValues: {
          ":from0": "PLAN",
          ":OnboardingStep": "CLINIC",
        },
      },
    },
  ]);
});

test("savePlan devuelve false si otro pedido ya guardó el plan, y deja subir cualquier otro error", async () => {
  const lostRace = capturingClient({
    failure: new TransactionCanceledException({
      message: "cancelada",
      $metadata: {},
      CancellationReasons: [
        { Code: "ConditionalCheckFailed" },
        { Code: "None" },
      ],
    }),
  });
  const unavailable = capturingClient({ failure: new Error("sin red") });
  const transition = { from: ["PLAN"], to: "CLINIC" } as const;

  assert.equal(
    await new OnboardingRepository(lostRace.client, TABLE_NAME).savePlan(
      planSubscription,
      USER_ID,
      transition,
    ),
    false,
  );
  await assert.rejects(
    new OnboardingRepository(unavailable.client, TABLE_NAME).savePlan(
      planSubscription,
      USER_ID,
      transition,
    ),
    /sin red/,
  );
});

const buildOwnerClinic = () =>
  createOwnerClinic(
    {
      ownerUserId: USER_ID,
      accountId: ACCOUNT_ID,
      name: "Consultorio Sol",
      address: "Av. Larco 123",
      specialty: "Cardiología",
    },
    new Date("2026-11-12T15:00:00.000Z"),
  );

test("crear Tu consultorio crea, en una transacción, la organización, la sede, la membership ADMIN sobre la organización, la membership DOCTOR sobre la sede con la especialidad, y pasa el paso a SCHEDULE", async () => {
  const { client, inputs } = capturingClient();
  const ownerClinic = buildOwnerClinic();
  const { organization, clinic } = ownerClinic;

  const created = await new OnboardingRepository(
    client,
    TABLE_NAME,
  ).createClinic(ownerClinic, { from: ["CLINIC"], to: "SCHEDULE" });

  assert.equal(created, true);
  const [transaction] = inputs as TransactWriteCommandInput[];
  const onlyIfNew = "attribute_not_exists(PK)";
  assert.deepEqual(transaction.TransactItems, [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `ORG#${organization.id}`,
          SK: "!",
          ItemType: "ORGANIZATION",
          Id: organization.id,
          AccountId: ACCOUNT_ID,
          Name: "Consultorio Sol",
          GSI1PK: `ACCOUNT#${ACCOUNT_ID}`,
          GSI1SK: `ORG#${organization.id}`,
        },
        ConditionExpression: onlyIfNew,
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `CLINIC#${clinic.id}`,
          SK: "!",
          ItemType: "CLINIC",
          Id: clinic.id,
          AccountId: ACCOUNT_ID,
          OrganizationId: organization.id,
          Name: "Consultorio Sol",
          Address: "Av. Larco 123",
          GSI1PK: `ORG#${organization.id}`,
          GSI1SK: `CLINIC#${clinic.id}`,
          GSI2PK: `ACCOUNT#${ACCOUNT_ID}`,
          GSI2SK: `CLINIC#${clinic.id}`,
        },
        ConditionExpression: onlyIfNew,
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${USER_ID}`,
          SK: `MEMBERSHIP#${organization.id}`,
          ItemType: "MEMBERSHIP",
          UserId: USER_ID,
          ResourceId: organization.id,
          ResourceType: "ORGANIZATION",
          AccountId: ACCOUNT_ID,
          Role: "ADMIN",
          GSI1PK: `ORG#${organization.id}`,
          GSI1SK: `MEMBER#${USER_ID}`,
        },
        ConditionExpression: onlyIfNew,
      },
    },
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${USER_ID}`,
          SK: `MEMBERSHIP#${clinic.id}`,
          ItemType: "MEMBERSHIP",
          UserId: USER_ID,
          ResourceId: clinic.id,
          ResourceType: "CLINIC",
          AccountId: ACCOUNT_ID,
          Role: "DOCTOR",
          Specialties: ["Cardiología"],
          GSI1PK: `CLINIC#${clinic.id}`,
          GSI1SK: `MEMBER#${USER_ID}`,
        },
        ConditionExpression: onlyIfNew,
      },
    },
    {
      Update: {
        TableName: TABLE_NAME,
        Key: { PK: `USER#${USER_ID}`, SK: "!" },
        ConditionExpression: "#OnboardingStep IN (:from0)",
        UpdateExpression: "SET #OnboardingStep = :OnboardingStep",
        ExpressionAttributeNames: { "#OnboardingStep": "OnboardingStep" },
        ExpressionAttributeValues: {
          ":from0": "CLINIC",
          ":OnboardingStep": "SCHEDULE",
        },
      },
    },
  ]);
});

test("createClinic devuelve false si otro pedido ya creó el consultorio, y deja subir cualquier otro error", async () => {
  const transition = { from: ["CLINIC"], to: "SCHEDULE" } as const;
  const canceledBecause = (userUpdateCode: string) =>
    new TransactionCanceledException({
      message: "cancelada",
      $metadata: {},
      CancellationReasons: ["None", "None", "None", "None", userUpdateCode].map(
        (Code) => ({ Code }),
      ),
    });
  const createWith = (failure: Error) =>
    new OnboardingRepository(
      capturingClient({ failure }).client,
      TABLE_NAME,
    ).createClinic(buildOwnerClinic(), transition);

  assert.equal(
    await createWith(canceledBecause("ConditionalCheckFailed")),
    false,
  );
  assert.equal(await createWith(canceledBecause("TransactionConflict")), false);
  await assert.rejects(createWith(new Error("sin red")), /sin red/);
});

const COMPLETED_AT = new Date("2026-11-12T16:00:00.000Z");

const buildSchedule = () => ({
  userId: USER_ID,
  clinicId: CLINIC_ID,
  accountId: ACCOUNT_ID,
  weeklySchedule: weeklyScheduleSchema.parse([
    { dayOfWeek: 3, startTime: "09:00", endTime: "13:00" },
    { dayOfWeek: 1, startTime: "08:30", endTime: "12:00" },
  ]),
  updatedAt: COMPLETED_AT,
});

const completeStepUpdate = {
  Update: {
    TableName: TABLE_NAME,
    Key: { PK: `USER#${USER_ID}`, SK: "!" },
    ConditionExpression: "#OnboardingStep IN (:from0)",
    UpdateExpression:
      "SET #OnboardingStep = :OnboardingStep, #OnboardingCompletedAt = :OnboardingCompletedAt",
    ExpressionAttributeNames: {
      "#OnboardingStep": "OnboardingStep",
      "#OnboardingCompletedAt": "OnboardingCompletedAt",
    },
    ExpressionAttributeValues: {
      ":from0": "SCHEDULE",
      ":OnboardingStep": "COMPLETED",
      ":OnboardingCompletedAt": "2026-11-12T16:00:00.000Z",
    },
  },
};

const completeTransition = { from: ["SCHEDULE"], to: "COMPLETED" } as const;

test("guardar Tu horario crea el horario del usuario en su sede y pasa el paso a COMPLETED, con OnboardingCompletedAt", async () => {
  const { client, inputs } = capturingClient();

  const completed = await new OnboardingRepository(
    client,
    TABLE_NAME,
  ).completeOnboarding(
    { userId: USER_ID, completedAt: COMPLETED_AT, schedule: buildSchedule() },
    completeTransition,
  );

  assert.equal(completed, true);
  const [transaction] = inputs as TransactWriteCommandInput[];
  assert.deepEqual(transaction.TransactItems, [
    {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${USER_ID}`,
          SK: `SCHEDULE#${CLINIC_ID}`,
          ItemType: "SCHEDULE",
          UserId: USER_ID,
          ClinicId: CLINIC_ID,
          AccountId: ACCOUNT_ID,
          WeeklySchedule: [
            { DayOfWeek: 1, StartTime: "08:30", EndTime: "12:00" },
            { DayOfWeek: 3, StartTime: "09:00", EndTime: "13:00" },
          ],
          UpdatedAt: "2026-11-12T16:00:00.000Z",
          GSI1PK: `CLINIC#${CLINIC_ID}`,
          GSI1SK: `SCHEDULE#${USER_ID}`,
        },
      },
    },
    completeStepUpdate,
  ]);
});

test("omitir Tu horario pasa el paso a COMPLETED, con OnboardingCompletedAt, sin crear horario", async () => {
  const { client, inputs } = capturingClient();

  const completed = await new OnboardingRepository(
    client,
    TABLE_NAME,
  ).completeOnboarding(
    { userId: USER_ID, completedAt: COMPLETED_AT },
    completeTransition,
  );

  assert.equal(completed, true);
  const [transaction] = inputs as TransactWriteCommandInput[];
  assert.deepEqual(transaction.TransactItems, [completeStepUpdate]);
});

test("completeOnboarding devuelve false si otro pedido ya terminó el onboarding, y deja subir cualquier otro error", async () => {
  const canceledBecause = (userUpdateCode: string) =>
    new TransactionCanceledException({
      message: "cancelada",
      $metadata: {},
      CancellationReasons: ["None", userUpdateCode].map((Code) => ({ Code })),
    });
  const completeWith = (failure: Error) =>
    new OnboardingRepository(
      capturingClient({ failure }).client,
      TABLE_NAME,
    ).completeOnboarding(
      { userId: USER_ID, completedAt: COMPLETED_AT, schedule: buildSchedule() },
      completeTransition,
    );

  assert.equal(
    await completeWith(canceledBecause("ConditionalCheckFailed")),
    false,
  );
  assert.equal(
    await completeWith(canceledBecause("TransactionConflict")),
    false,
  );
  await assert.rejects(completeWith(new Error("sin red")), /sin red/);
});
