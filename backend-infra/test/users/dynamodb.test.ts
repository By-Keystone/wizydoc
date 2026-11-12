import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
  TransactionConflictException,
} from "@aws-sdk/client-dynamodb";
import type {
  DynamoDBDocumentClient,
  GetCommandInput,
  PutCommandInput,
  TransactWriteCommandInput,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  CURRENT_CHECKBOX_TEXT_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";
import { createSignUpVerificationToken } from "../../lib/src/users/domain/sign-up-verification-token.entity";
import { createSignUpCode } from "../../lib/src/users/domain/sign-up-code.entity";
import { createOwnerClinic } from "../../lib/src/users/domain/clinic.entity";
import { createSubscription } from "../../lib/src/users/domain/subscription.entity";
import { createTermsAcceptance } from "../../lib/src/users/domain/terms-acceptance.entity";
import { createAccount } from "../../lib/src/users/domain/account.entity";
import { createUser } from "../../lib/src/users/domain/user.entity";
import { DynamoDBAccountExistsNotices } from "../../lib/src/users/infrastructure/persistence/dynamodb/account-exists-notices";
import {
  DynamoDBIpRateLimit,
  EMAIL_SEND_RATE_LIMIT,
  SIGN_IN_RATE_LIMIT,
  SIGN_UP_VERIFY_RATE_LIMIT,
} from "../../lib/src/users/infrastructure/persistence/dynamodb/ip-rate-limit";
import { AccountRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/account.repository";
import { ClinicRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/clinic.repository";
import { SignUpVerificationTokenRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/sign-up-verification-token.repository";
import { SignUpCodeRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/sign-up-code.repository";
import { OnboardingRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/onboarding.repository";
import { UserRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/user.repository";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../lib/src/users/domain/value-objects/person-name.vo";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";
import { treatmentSchema } from "../../lib/src/users/domain/value-objects/treatment.vo";
import {
  fromDomainToDynamo,
  fromDynamoToDomain,
} from "../../lib/src/users/infrastructure/persistence/dynamodb/user.mappers";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { buildUser, COGNITO_SUB } from "./fakes";

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
const TEN_PAST_NOON = Date.UTC(2026, 10, 6, 12, 10, 30);
const THIRTEEN_PAST_NOON_AND_HALF = Date.UTC(2026, 10, 6, 12, 13, 30);
const THIRTEEN_PAST_NOON = Date.UTC(2026, 10, 6, 12, 13, 0) / 1000;
const WINDOW_START = Date.UTC(2026, 10, 6, 12, 10, 0) / 1000;

const capturingClient = ({
  failure,
  response = {},
}: {
  failure?: Error;
  response?: unknown;
} = {}) => {
  const inputs: unknown[] = [];
  const client = {
    send: async (command: { input: unknown }) => {
      inputs.push(command.input);
      if (failure) throw failure;
      return response;
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, inputs };
};

const buildOwnerWithAccount = () => {
  const newAccount = createAccount();
  const user = createUser({
    email: buildUser().email,
    cognitoSub: COGNITO_SUB,
    accountId: newAccount.id,
  });
  return { user, account: { ...newAccount, ownerUserId: user.id } };
};

test("existsByEmail consulta el índice del correo con una proyección mínima y revisa el tipo, sin leer el usuario entero", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const withUser = capturingClient({
    response: { Items: [{ ItemType: "USER" }] },
  });
  const withOtherType = capturingClient({
    response: { Items: [{ ItemType: "PATIENT" }] },
  });
  const withNothing = capturingClient({ response: { Items: [] } });

  assert.equal(
    await new UserRepository(withUser.client, TABLE_NAME).existsByEmail(email),
    true,
  );
  assert.equal(
    await new UserRepository(withOtherType.client, TABLE_NAME).existsByEmail(
      email,
    ),
    false,
  );
  assert.equal(
    await new UserRepository(withNothing.client, TABLE_NAME).existsByEmail(
      email,
    ),
    false,
  );
  const [query] = withUser.inputs as {
    IndexName?: string;
    ProjectionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  }[];
  assert.equal(query.IndexName, "GSI1");
  assert.equal(query.ProjectionExpression, "#ItemType");
  assert.equal(
    query.ExpressionAttributeValues?.[":gsi1pk"],
    "USER_EMAIL#ana@clinica.pe",
  );
});

test("cuenta los envíos por IP en ventanas fijas de 10 minutos, y rechaza desde el cuarto", async () => {
  const { client, inputs } = capturingClient();
  const attempts = new DynamoDBIpRateLimit(
    client,
    TABLE_NAME,
    EMAIL_SEND_RATE_LIMIT,
    () => TEN_PAST_NOON,
  );

  assert.equal(await attempts.tryRegister("190.42.10.7"), true);

  const [update] = inputs as UpdateCommandInput[];
  assert.deepEqual(update.Key, {
    PK: "EMAIL_SEND_ATTEMPTS#190.42.10.7",
    SK: String(WINDOW_START),
  });
  assert.equal(
    update.UpdateExpression,
    "ADD Attempts :one SET DeleteAfter = :deleteAfter, ItemType = :itemType",
  );
  assert.equal(
    update.ConditionExpression,
    "attribute_not_exists(Attempts) OR Attempts < :maxAttempts",
  );
  assert.deepEqual(update.ExpressionAttributeValues, {
    ":one": 1,
    ":maxAttempts": 3,
    ":deleteAfter": WINDOW_START + 600,
    ":itemType": "EMAIL_SEND_ATTEMPTS",
  });
});

test("agrupa las IPv6 por su red /64 y sin IP usa un cupo compartido", async () => {
  const { client, inputs } = capturingClient();
  const attempts = new DynamoDBIpRateLimit(
    client,
    TABLE_NAME,
    EMAIL_SEND_RATE_LIMIT,
    () => TEN_PAST_NOON,
  );

  await attempts.tryRegister("2001:db8:85a3:12::1");
  await attempts.tryRegister("2001:DB8:85A3:12:ffff:ffff:ffff:ffff");
  await attempts.tryRegister("::ffff:190.42.10.7");
  await attempts.tryRegister(undefined);

  const keys = (inputs as UpdateCommandInput[]).map((update) => update.Key?.PK);
  assert.deepEqual(keys, [
    "EMAIL_SEND_ATTEMPTS#2001:0db8:85a3:0012::/64",
    "EMAIL_SEND_ATTEMPTS#2001:0db8:85a3:0012::/64",
    "EMAIL_SEND_ATTEMPTS#190.42.10.7",
    "EMAIL_SEND_ATTEMPTS#unknown",
  ]);
});

test("superado el máximo, el intento no se registra", async () => {
  const { client } = capturingClient({
    failure: new ConditionalCheckFailedException({
      message: "límite",
      $metadata: {},
    }),
  });

  const isAllowed = await new DynamoDBIpRateLimit(
    client,
    TABLE_NAME,
    EMAIL_SEND_RATE_LIMIT,
  ).tryRegister("190.42.10.7");

  assert.equal(isAllowed, false);
});

test("el ítem del código guarda sólo su hash, sin copiar el correo ni el vencimiento, con los intentos en cero y el vencimiento como TTL", async () => {
  const { client, inputs } = capturingClient();
  const email = emailSchema.parse("ana@clinica.pe");
  const signUpCode = createSignUpCode(email, new Date(TEN_PAST_NOON));

  await new SignUpCodeRepository(
    client,
    TABLE_NAME,
  ).saveUnlessRequestedRecently(signUpCode);

  const [put] = inputs as PutCommandInput[];
  const expiresAt = (TEN_PAST_NOON + 10 * 60 * 1000) / 1000;
  assert.equal(put.TableName, TABLE_NAME);
  assert.deepEqual(put.Item, {
    PK: "SIGN_UP_CODE#ana@clinica.pe",
    SK: "!",
    ItemType: "SIGN_UP_CODE",
    CodeHash: signUpCode.codeHash,
    Attempts: 0,
    DeleteAfter: expiresAt,
  });
});

test("pedir otro código lo guarda con los intentos en cero, sólo si el anterior se pidió hace un minuto o más", async () => {
  const { client, inputs } = capturingClient();
  const email = emailSchema.parse("ana@clinica.pe");
  const signUpCode = createSignUpCode(email, new Date(TEN_PAST_NOON));

  const wasSaved = await new SignUpCodeRepository(
    client,
    TABLE_NAME,
  ).saveUnlessRequestedRecently(signUpCode);

  const [put] = inputs as PutCommandInput[];
  assert.equal(wasSaved, true);
  assert.equal(put.Item?.PK, "SIGN_UP_CODE#ana@clinica.pe");
  assert.equal(put.Item?.Attempts, 0);
  assert.equal(
    put.ConditionExpression,
    "attribute_not_exists(PK) OR DeleteAfter <= :latestReplaceableExpiry",
  );
  assert.deepEqual(put.ExpressionAttributeValues, {
    ":latestReplaceableExpiry": (TEN_PAST_NOON + 9 * 60 * 1000) / 1000,
  });
});

test("si el anterior se pidió hace menos de un minuto, el repositorio informa que no guardó, y cualquier otro error sube", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const recentlyRequested = capturingClient({
    failure: new ConditionalCheckFailedException({
      message: "enfriamiento",
      $metadata: {},
    }),
  });
  const unavailable = capturingClient({
    failure: new Error("DynamoDB no disponible"),
  });

  const wasSaved = await new SignUpCodeRepository(
    recentlyRequested.client,
    TABLE_NAME,
  ).saveUnlessRequestedRecently(createSignUpCode(email));

  assert.equal(wasSaved, false);
  await assert.rejects(
    new SignUpCodeRepository(
      unavailable.client,
      TABLE_NAME,
    ).saveUnlessRequestedRecently(createSignUpCode(email)),
    { message: "DynamoDB no disponible" },
  );
});

test("el aviso a un correo con cuenta se guarda con un minuto de vida, sólo si el anterior ya pasó", async () => {
  const { client, inputs } = capturingClient();
  const email = emailSchema.parse("ana@clinica.pe");
  const nowInSeconds = TEN_PAST_NOON / 1000;

  const wasRegistered = await new DynamoDBAccountExistsNotices(
    client,
    TABLE_NAME,
    () => TEN_PAST_NOON,
  ).tryRegister(email);

  const [put] = inputs as PutCommandInput[];
  assert.equal(wasRegistered, true);
  assert.deepEqual(put.Item, {
    PK: "SIGN_UP_NOTICE#ana@clinica.pe",
    SK: "!",
    ItemType: "SIGN_UP_NOTICE",
    DeleteAfter: nowInSeconds + 60,
  });
  assert.equal(
    put.ConditionExpression,
    "attribute_not_exists(PK) OR DeleteAfter <= :now",
  );
  assert.deepEqual(put.ExpressionAttributeValues, { ":now": nowInSeconds });
});

test("si el aviso anterior salió hace menos de un minuto, informa que no se registró, y cualquier otro error sube", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const recentlySent = capturingClient({
    failure: new ConditionalCheckFailedException({
      message: "enfriamiento",
      $metadata: {},
    }),
  });
  const unavailable = capturingClient({
    failure: new Error("DynamoDB no disponible"),
  });

  assert.equal(
    await new DynamoDBAccountExistsNotices(
      recentlySent.client,
      TABLE_NAME,
    ).tryRegister(email),
    false,
  );
  await assert.rejects(
    new DynamoDBAccountExistsNotices(
      unavailable.client,
      TABLE_NAME,
    ).tryRegister(email),
    { message: "DynamoDB no disponible" },
  );
});

test("la verificación suma el intento antes de comparar, sólo si el código existe, no venció y le quedan intentos, y lee el hash guardado", async () => {
  const { client, inputs } = capturingClient({
    response: { Attributes: { CodeHash: "hash-guardado" } },
  });
  const email = emailSchema.parse("ana@clinica.pe");

  const codeHash = await new SignUpCodeRepository(
    client,
    TABLE_NAME,
    () => TEN_PAST_NOON,
  ).registerAttemptAndReadCodeHash(email);

  const [update] = inputs as UpdateCommandInput[];
  assert.equal(codeHash, "hash-guardado");
  assert.deepEqual(update.Key, { PK: "SIGN_UP_CODE#ana@clinica.pe", SK: "!" });
  assert.equal(update.UpdateExpression, "ADD Attempts :one");
  assert.equal(
    update.ConditionExpression,
    "attribute_exists(PK) AND Attempts < :maxAttempts AND DeleteAfter > :now",
  );
  assert.deepEqual(update.ExpressionAttributeValues, {
    ":one": 1,
    ":maxAttempts": 5,
    ":now": TEN_PAST_NOON / 1000,
  });
  assert.equal(update.ReturnValues, "ALL_NEW");
});

test("sin código que probar, o si una transacción lo está cambiando, no hay hash; cualquier otro error sube", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const repositoryFailingWith = (failure: Error) =>
    new SignUpCodeRepository(capturingClient({ failure }).client, TABLE_NAME);

  assert.equal(
    await repositoryFailingWith(
      new ConditionalCheckFailedException({ message: "x", $metadata: {} }),
    ).registerAttemptAndReadCodeHash(email),
    undefined,
  );
  assert.equal(
    await repositoryFailingWith(
      new TransactionConflictException({ message: "x", $metadata: {} }),
    ).registerAttemptAndReadCodeHash(email),
    undefined,
  );
  await assert.rejects(
    repositoryFailingWith(
      new Error("DynamoDB no disponible"),
    ).registerAttemptAndReadCodeHash(email),
    { message: "DynamoDB no disponible" },
  );
});

test("gastar el código borra el código sólo si sigue siendo el mismo y guarda el token de verificación, con sólo su hash, en una transacción", async () => {
  const { client, inputs } = capturingClient();
  const email = emailSchema.parse("ana@clinica.pe");
  const verificationToken = createSignUpVerificationToken(
    email,
    new Date(TEN_PAST_NOON),
  );

  const wasSpent = await new SignUpCodeRepository(
    client,
    TABLE_NAME,
  ).spendForVerificationToken(email, "hash-del-codigo", verificationToken);

  const [transaction] = inputs as TransactWriteCommandInput[];
  const [deletion, creation] = transaction.TransactItems ?? [];
  assert.equal(wasSpent, true);
  assert.deepEqual(deletion.Delete?.Key, {
    PK: "SIGN_UP_CODE#ana@clinica.pe",
    SK: "!",
  });
  assert.equal(deletion.Delete?.ConditionExpression, "CodeHash = :codeHash");
  assert.deepEqual(deletion.Delete?.ExpressionAttributeValues, {
    ":codeHash": "hash-del-codigo",
  });
  assert.equal(creation.Put?.ConditionExpression, "attribute_not_exists(PK)");
  assert.deepEqual(creation.Put?.Item, {
    PK: `SIGN_UP_VERIFICATION#${verificationToken.tokenHash}`,
    SK: "!",
    ItemType: "SIGN_UP_VERIFICATION",
    Email: "ana@clinica.pe",
    DeleteAfter: (TEN_PAST_NOON + 15 * 60 * 1000) / 1000,
  });
  assert.equal(JSON.stringify(inputs).includes(verificationToken.token), false);
});

test("si otra verificación gastó el código antes, la transacción cancelada informa que no se gastó, y cualquier otro error sube", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const verificationToken = createSignUpVerificationToken(email);
  const spendWith = (failure: Error) =>
    new SignUpCodeRepository(
      capturingClient({ failure }).client,
      TABLE_NAME,
    ).spendForVerificationToken(email, "hash", verificationToken);
  const canceledBecause = (codes: string[]) =>
    new TransactionCanceledException({
      message: "cancelada",
      $metadata: {},
      CancellationReasons: codes.map((Code) => ({ Code })),
    });

  assert.equal(
    await spendWith(canceledBecause(["ConditionalCheckFailed", "None"])),
    false,
  );
  assert.equal(
    await spendWith(canceledBecause(["TransactionConflict", "None"])),
    false,
  );
  await assert.rejects(
    spendWith(canceledBecause(["ProvisionedThroughputExceeded", "None"])),
  );
  await assert.rejects(spendWith(canceledBecause([])));
  await assert.rejects(spendWith(new Error("DynamoDB no disponible")), {
    message: "DynamoDB no disponible",
  });
});

test("el límite de verificaciones usa su propio prefijo y su máximo de 10, aparte del de los envíos", async () => {
  const { client, inputs } = capturingClient();

  await new DynamoDBIpRateLimit(
    client,
    TABLE_NAME,
    SIGN_UP_VERIFY_RATE_LIMIT,
    () => TEN_PAST_NOON,
  ).tryRegister("190.42.10.7");

  const [update] = inputs as UpdateCommandInput[];
  assert.deepEqual(update.Key, {
    PK: "SIGN_UP_VERIFY_ATTEMPTS#190.42.10.7",
    SK: String(WINDOW_START),
  });
  assert.deepEqual(update.ExpressionAttributeValues, {
    ":one": 1,
    ":maxAttempts": 10,
    ":deleteAfter": WINDOW_START + 600,
    ":itemType": "SIGN_UP_VERIFY_ATTEMPTS",
  });
});

test("crear la cuenta confirmada guarda el usuario, su cuenta y su constancia y gasta el token en una sola transacción, con el token sólo si es del correo y no venció", async () => {
  const { client, inputs } = capturingClient();
  const { user, account } = buildOwnerWithAccount();
  const acceptedAt = new Date(TEN_PAST_NOON);
  const termsAcceptance = createTermsAcceptance(
    {
      userId: user.id,
      email: user.email,
      ipAddress: "190.42.10.7",
      userAgent: "Mozilla/5.0",
    },
    acceptedAt,
  );

  const wasCreated = await new UserRepository(
    client,
    TABLE_NAME,
    () => TEN_PAST_NOON,
  ).createConfirmed(
    user,
    account,
    { email: user.email, tokenHash: "hash-del-token" },
    termsAcceptance,
  );

  const [transaction] = inputs as TransactWriteCommandInput[];
  const [userPut, accountPut, termsPut, tokenDelete] =
    transaction.TransactItems ?? [];
  assert.equal(wasCreated, true);
  assert.equal(inputs.length, 1);
  assert.equal(transaction.TransactItems?.length, 4);
  assert.equal(userPut.Put?.Item?.PK, `USER#${user.id}`);
  assert.equal(userPut.Put?.Item?.Confirmed, true);
  assert.equal(userPut.Put?.Item?.AccountId, account.id);
  assert.equal(userPut.Put?.Item?.OnboardingStep, "PERSONAL_DATA");
  assert.equal("OnboardingCompleted" in (userPut.Put?.Item ?? {}), false);
  assert.equal(userPut.Put?.ConditionExpression, "attribute_not_exists(PK)");
  assert.deepEqual(accountPut.Put?.Item, {
    PK: `ACCOUNT#${account.id}`,
    SK: "!",
    ItemType: "ACCOUNT",
    Id: account.id,
    OwnerUserId: user.id,
  });
  assert.equal(accountPut.Put?.ConditionExpression, "attribute_not_exists(PK)");
  assert.deepEqual(termsPut.Put?.Item, {
    PK: `USER#${user.id}`,
    SK: `TERMS_ACCEPTANCE#${acceptedAt.toISOString()}`,
    ItemType: "TERMS_ACCEPTANCE",
    Email: "ana@clinica.pe",
    TermsVersion: CURRENT_TERMS_VERSION,
    PrivacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    CheckboxTextVersion: CURRENT_CHECKBOX_TEXT_VERSION,
    AcceptedAt: "2026-11-06T12:10:30.000Z",
    IpAddress: "190.42.10.7",
    UserAgent: "Mozilla/5.0",
    Source: "sign-up",
  });
  assert.deepEqual(tokenDelete.Delete?.Key, {
    PK: "SIGN_UP_VERIFICATION#hash-del-token",
    SK: "!",
  });
  assert.equal(
    tokenDelete.Delete?.ConditionExpression,
    "attribute_exists(PK) AND Email = :email AND DeleteAfter > :now",
  );
  assert.deepEqual(tokenDelete.Delete?.ExpressionAttributeValues, {
    ":email": user.email,
    ":now": TEN_PAST_NOON / 1000,
  });
});

test("el mapper escribe y vuelve a leer los datos personales, incluido el tratamiento null", () => {
  const stored = fromDomainToDynamo(
    fromDynamoToDomain({
      ...userItem,
      GivenName: "Ana",
      FamilyName: "Pérez",
      Phone: "+51987654321",
      Treatment: null,
    }),
  );

  assert.equal(stored.GivenName, "Ana");
  assert.equal(stored.FamilyName, "Pérez");
  assert.equal(stored.Phone, "+51987654321");
  assert.equal(stored.Treatment, null);
});

test("el usuario nuevo ya no guarda OnboardingCompleted", async () => {
  const { client, inputs } = capturingClient();
  const { user, account } = buildOwnerWithAccount();

  await new UserRepository(client, TABLE_NAME).createConfirmed(user, account, {
    email: user.email,
    tokenHash: "hash",
  });

  const [transaction] = inputs as TransactWriteCommandInput[];
  assert.deepEqual(transaction.TransactItems?.[0].Put?.Item, {
    PK: `USER#${user.id}`,
    SK: "!",
    ItemType: "USER",
    GSI1PK: "USER_EMAIL#ana@clinica.pe",
    GSI1SK: "!",
    GSI2PK: `COGNITO#${COGNITO_SUB}`,
    GSI2SK: "!",
    Id: user.id,
    Email: "ana@clinica.pe",
    Confirmed: true,
    AccountId: account.id,
    OnboardingStep: "PERSONAL_DATA",
    CognitoSub: COGNITO_SUB,
  });
});

test("si otra confirmación gastó el token antes, la transacción cancelada informa que no se creó, y cualquier otro error sube", async () => {
  const { user, account } = buildOwnerWithAccount();
  const createWith = (failure: Error) =>
    new UserRepository(
      capturingClient({ failure }).client,
      TABLE_NAME,
    ).createConfirmed(user, account, { email: user.email, tokenHash: "hash" });

  assert.equal(
    await createWith(
      new TransactionCanceledException({
        message: "cancelada",
        $metadata: {},
        CancellationReasons: [
          { Code: "None" },
          { Code: "None" },
          { Code: "ConditionalCheckFailed" },
        ],
      }),
    ),
    false,
  );
  await assert.rejects(createWith(new Error("DynamoDB no disponible")), {
    message: "DynamoDB no disponible",
  });
});

test("el token de verificación se lee con lectura consistente y sólo vale si es del correo, del tipo esperado y no venció", async () => {
  const email = emailSchema.parse("ana@clinica.pe");
  const validRecord = {
    ItemType: "SIGN_UP_VERIFICATION",
    Email: "ana@clinica.pe",
    DeleteAfter: TEN_PAST_NOON / 1000 + 1,
  };
  const isValidWith = async (record: Record<string, unknown> | undefined) => {
    const { client, inputs } = capturingClient({ response: { Item: record } });
    const isValid = await new SignUpVerificationTokenRepository(
      client,
      TABLE_NAME,
      () => TEN_PAST_NOON,
    ).isValidFor(email, "hash-del-token");
    return { isValid, input: inputs[0] as GetCommandInput };
  };

  const valid = await isValidWith(validRecord);

  assert.equal(valid.isValid, true);
  assert.equal(valid.input.ConsistentRead, true);
  assert.deepEqual(valid.input.Key, {
    PK: "SIGN_UP_VERIFICATION#hash-del-token",
    SK: "!",
  });
  for (const record of [
    undefined,
    { ...validRecord, Email: "beto@clinica.pe" },
    { ...validRecord, ItemType: "SIGN_UP_CODE" },
    { ...validRecord, DeleteAfter: TEN_PAST_NOON / 1000 },
  ]) {
    assert.equal((await isValidWith(record)).isValid, false);
  }
});

test("isConfirmed consulta GSI2 por el sub con una proyección mínima y exige el tipo USER y Confirmed", async () => {
  const confirmed = capturingClient({
    response: { Items: [{ ItemType: "USER", Confirmed: true }] },
  });
  const unconfirmed = capturingClient({
    response: { Items: [{ ItemType: "USER", Confirmed: false }] },
  });
  const otherType = capturingClient({
    response: { Items: [{ ItemType: "PATIENT", Confirmed: true }] },
  });
  const withoutItem = capturingClient({ response: { Items: [] } });

  const results = [];
  for (const { client } of [confirmed, unconfirmed, otherType, withoutItem]) {
    results.push(
      await new UserRepository(client, TABLE_NAME).isConfirmed(COGNITO_SUB),
    );
  }

  assert.deepEqual(results, [true, false, false, false]);
  const [query] = confirmed.inputs as {
    IndexName?: string;
    ProjectionExpression?: string;
    Limit?: number;
    ExpressionAttributeValues?: Record<string, unknown>;
  }[];
  assert.equal(query.IndexName, "GSI2");
  assert.equal(query.ProjectionExpression, "#ItemType, #Confirmed");
  assert.equal(query.Limit, 1);
  assert.equal(
    query.ExpressionAttributeValues?.[":gsi2pk"],
    `COGNITO#${COGNITO_SUB}`,
  );
});

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
  const found = new UserRepository(
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
  assert.equal(index.Limit, 2);
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
    GivenName: " Ana ",
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

test("un usuario sin AccountId u OnboardingStep válidos lanza un error, y una partición de más de una página también", async () => {
  const { AccountId: _accountId, ...withoutAccount } = userItem;
  const invalidItems = [
    withoutAccount,
    { ...userItem, OnboardingStep: "OTRO" },
    { ...userItem, Email: "no es un correo" },
  ];

  const invalidMemberships = [
    { ...membershipItem, Role: "OWNER" },
    { ...membershipItem, ResourceType: "PATIENT" },
  ];

  for (const invalid of invalidItems) {
    await assert.rejects(
      findSession(...sessionResponses({ Items: [invalid] })).found,
      { name: "ZodError" },
    );
  }
  for (const invalid of invalidMemberships) {
    await assert.rejects(
      findSession(...sessionResponses({ Items: [userItem, invalid] })).found,
      { name: "ZodError" },
    );
  }
  await assert.rejects(
    findSession(
      ...sessionResponses({
        Items: [userItem],
        LastEvaluatedKey: { PK: `USER#${USER_ID}`, SK: "!" },
      }),
    ).found,
    { message: /no cabe/ },
  );
});

test("dos usuarios con el mismo sub en GSI2 lanzan un error sin valores, y un Id que no es ULID también", async () => {
  await assert.rejects(
    findSession({
      Items: [
        { ItemType: "USER", Id: USER_ID },
        { ItemType: "USER", Id: CLINIC_ID },
      ],
    }).found,
    { message: "Hay más de un usuario con el mismo sub" },
  );
  await assert.rejects(
    findSession({ Items: [{ ItemType: "USER", Id: "" }] }).found,
    { name: "ZodError" },
  );
});

test("el límite de inicios de sesión usa su propio prefijo, un máximo de 5 y ventanas de un minuto", async () => {
  const { client, inputs } = capturingClient();

  await new DynamoDBIpRateLimit(
    client,
    TABLE_NAME,
    SIGN_IN_RATE_LIMIT,
    () => THIRTEEN_PAST_NOON_AND_HALF,
  ).tryRegister("190.42.10.7");

  const [update] = inputs as UpdateCommandInput[];
  assert.deepEqual(update.Key, {
    PK: "SIGN_IN_ATTEMPTS#190.42.10.7",
    SK: String(THIRTEEN_PAST_NOON),
  });
  assert.deepEqual(update.ExpressionAttributeValues, {
    ":one": 1,
    ":maxAttempts": 5,
    ":deleteAfter": THIRTEEN_PAST_NOON + 60,
    ":itemType": "SIGN_IN_ATTEMPTS",
  });
});

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
