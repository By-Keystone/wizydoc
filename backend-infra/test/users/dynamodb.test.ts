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
import { createConfirmationToken } from "../../lib/src/users/domain/confirmation-token.entity";
import {
  CURRENT_CHECKBOX_TEXT_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";
import { createSignUpVerificationToken } from "../../lib/src/users/domain/sign-up-verification-token.entity";
import { createSignUpCode } from "../../lib/src/users/domain/sign-up-code.entity";
import { createTermsAcceptance } from "../../lib/src/users/domain/terms-acceptance.entity";
import { DynamoDBAccountExistsNotices } from "../../lib/src/users/infrastructure/persistence/dynamodb/account-exists-notices";
import {
  DynamoDBIpRateLimit,
  EMAIL_SEND_RATE_LIMIT,
  SIGN_UP_VERIFY_RATE_LIMIT,
} from "../../lib/src/users/infrastructure/persistence/dynamodb/ip-rate-limit";
import { SignUpVerificationTokenRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/sign-up-verification-token.repository";
import { SignUpCodeRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/sign-up-code.repository";
import {
  fromDomainToDynamo,
  fromDynamoToDomain,
} from "../../lib/src/users/infrastructure/persistence/dynamodb/user.mappers";
import { UserRepository } from "../../lib/src/users/infrastructure/persistence/dynamodb/user.repository";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { buildUser } from "./fakes";

const TABLE_NAME = "MainTable";
const TEN_PAST_NOON = Date.UTC(2026, 10, 6, 12, 10, 30);
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

test("crea el usuario sin confirmar, su token y su constancia en una sola transacción, cada uno con su tipo y sin pisar ítems existentes", async () => {
  const { client, inputs } = capturingClient();
  const user = buildUser({ confirmed: false, onboardingCompleted: false });
  const confirmationToken = createConfirmationToken(user.id);
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

  await new UserRepository(client, TABLE_NAME).create(
    user,
    confirmationToken,
    termsAcceptance,
  );

  const [transaction] = inputs as TransactWriteCommandInput[];
  const puts =
    transaction.TransactItems?.map((operation) => operation.Put) ?? [];
  assert.equal(puts.length, 3);
  for (const put of puts) {
    assert.equal(put?.TableName, TABLE_NAME);
    assert.equal(put?.ConditionExpression, "attribute_not_exists(PK)");
  }
  const [userRecord, tokenRecord, termsRecord] = puts.map((put) => put?.Item);
  assert.equal(userRecord?.PK, `USER#${user.id}`);
  assert.equal(userRecord?.ItemType, "USER");
  assert.equal(userRecord?.GSI1PK, "USER_EMAIL#ana@clinica.pe");
  assert.equal(userRecord?.Confirmed, false);
  assert.equal(userRecord?.OnboardingCompleted, false);
  assert.equal(
    tokenRecord?.PK,
    `EMAIL_CONFIRMATION#${confirmationToken.tokenHash}`,
  );
  assert.equal(tokenRecord?.ItemType, "EMAIL_CONFIRMATION");
  assert.deepEqual(termsRecord, {
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
});

test("el ítem del token guarda sólo su hash y vence con TTL", async () => {
  const { client, inputs } = capturingClient();
  const user = buildUser();
  const confirmationToken = createConfirmationToken(user.id);

  await new UserRepository(client, TABLE_NAME).create(user, confirmationToken);

  assert.equal(JSON.stringify(inputs).includes(confirmationToken.token), false);
  const [transaction] = inputs as TransactWriteCommandInput[];
  assert.equal(transaction.TransactItems?.length, 2);
  const tokenRecord = transaction.TransactItems?.[1]?.Put?.Item;
  const expiresAt = Math.floor(confirmationToken.expiresAt.getTime() / 1000);
  assert.equal(tokenRecord?.ExpiresAt, expiresAt);
  assert.equal(tokenRecord?.DeleteAfter, expiresAt);
});

test("findByEmail busca por el índice del correo y devuelve sólo ítems de tipo usuario", async () => {
  const user = buildUser();
  const userRecord = fromDomainToDynamo(user);
  const withUser = capturingClient({ response: { Items: [userRecord] } });
  const withOtherType = capturingClient({
    response: { Items: [{ ...userRecord, ItemType: "PATIENT" }] },
  });

  const found = await new UserRepository(
    withUser.client,
    TABLE_NAME,
  ).findByEmail(user.email);
  const notFound = await new UserRepository(
    withOtherType.client,
    TABLE_NAME,
  ).findByEmail(user.email);

  assert.equal(found?.id, user.id);
  assert.equal(notFound, undefined);
  const [query] = withUser.inputs as {
    IndexName?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  }[];
  assert.equal(query.IndexName, "GSI1");
  assert.equal(
    query.ExpressionAttributeValues?.[":gsi1pk"],
    "USER_EMAIL#ana@clinica.pe",
  );
});

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

test("un usuario sin nombre, apellido ni teléfono se guarda y se lee sin esos datos", () => {
  const user = buildUser({
    name: undefined,
    lastName: undefined,
    phone: undefined,
  });

  const record = fromDomainToDynamo(user);
  const restored = fromDynamoToDomain(record);

  assert.equal(record.Name, undefined);
  assert.equal(record.LastName, undefined);
  assert.equal(record.Phone, undefined);
  assert.equal(restored.name, undefined);
  assert.equal(restored.lastName, undefined);
  assert.equal(restored.phone, undefined);
  assert.equal(restored.email, user.email);
});

test("crear la cuenta confirmada guarda el usuario y su constancia y gasta el token en una transacción, con el token sólo si es del correo y no venció", async () => {
  const { client, inputs } = capturingClient();
  const user = buildUser({ confirmed: true, onboardingCompleted: false });
  const termsAcceptance = createTermsAcceptance({
    userId: user.id,
    email: user.email,
  });

  const wasCreated = await new UserRepository(
    client,
    TABLE_NAME,
    () => TEN_PAST_NOON,
  ).createConfirmed(
    user,
    { email: user.email, tokenHash: "hash-del-token" },
    termsAcceptance,
  );

  const [transaction] = inputs as TransactWriteCommandInput[];
  const [userPut, termsPut, tokenDelete] = transaction.TransactItems ?? [];
  assert.equal(wasCreated, true);
  assert.equal(transaction.TransactItems?.length, 3);
  assert.equal(userPut.Put?.Item?.PK, `USER#${user.id}`);
  assert.equal(userPut.Put?.Item?.Confirmed, true);
  assert.equal(userPut.Put?.ConditionExpression, "attribute_not_exists(PK)");
  assert.equal(termsPut.Put?.Item?.ItemType, "TERMS_ACCEPTANCE");
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

test("si otra confirmación gastó el token antes, la transacción cancelada informa que no se creó, y cualquier otro error sube", async () => {
  const user = buildUser();
  const createWith = (failure: Error) =>
    new UserRepository(
      capturingClient({ failure }).client,
      TABLE_NAME,
    ).createConfirmed(user, { email: user.email, tokenHash: "hash" });

  assert.equal(
    await createWith(
      new TransactionCanceledException({
        message: "cancelada",
        $metadata: {},
        CancellationReasons: [
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
