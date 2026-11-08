import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidPasswordException,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { CognitoIdentityProvider } from "../../lib/src/users/infrastructure/identity-provider/cognito/cognito";
import { COGNITO_SUB, cognitoClient } from "./fakes";

const USER_POOL_ID = "us-east-2_ejemplo";
const email = emailSchema.parse("ana@clinica.pe");

const createdUserResponse = {
  User: { Attributes: [{ Name: "sub", Value: COGNITO_SUB }] },
};

test("crea el usuario sin que Cognito mande correos y le fija la contraseña definitiva", async () => {
  const { client, sent } = cognitoClient({
    AdminCreateUserCommand: createdUserResponse,
  });

  const cognitoSub = await new CognitoIdentityProvider(
    client,
    USER_POOL_ID,
  ).createUserIfAbsent({ email, password: "una-clave-segura" });

  assert.equal(cognitoSub, COGNITO_SUB);
  assert.deepEqual(
    sent.map((command) => command.name),
    ["AdminCreateUserCommand", "AdminSetUserPasswordCommand"],
  );
  assert.equal(sent[0].input.MessageAction, "SUPPRESS");
  assert.equal(sent[0].input.Username, "ana@clinica.pe");
  assert.deepEqual(sent[1].input, {
    UserPoolId: USER_POOL_ID,
    Username: COGNITO_SUB,
    Password: "una-clave-segura",
    Permanent: true,
  });
});

test("con un correo que ya existe en Cognito devuelve undefined sin fijar contraseña", async () => {
  const { client, sent } = cognitoClient({
    AdminCreateUserCommand: new UsernameExistsException({
      message: "existe",
      $metadata: {},
    }),
  });

  const cognitoSub = await new CognitoIdentityProvider(
    client,
    USER_POOL_ID,
  ).createUserIfAbsent({ email, password: "una-clave-segura" });

  assert.equal(cognitoSub, undefined);
  assert.deepEqual(
    sent.map((command) => command.name),
    ["AdminCreateUserCommand"],
  );
});

test("si Cognito rechaza la contraseña, borra el usuario recién creado y propaga el error", async () => {
  const { client, sent } = cognitoClient({
    AdminCreateUserCommand: createdUserResponse,
    AdminSetUserPasswordCommand: new InvalidPasswordException({
      message: "contraseña inválida",
      $metadata: {},
    }),
  });

  await assert.rejects(
    new CognitoIdentityProvider(client, USER_POOL_ID).createUserIfAbsent({
      email,
      password: "una-clave-segura",
    }),
    InvalidPasswordException,
  );
  assert.deepEqual(
    sent.map((command) => command.name),
    [
      "AdminCreateUserCommand",
      "AdminSetUserPasswordCommand",
      "AdminDeleteUserCommand",
    ],
  );
  assert.equal(sent[2].input.Username, COGNITO_SUB);
});

test("si además falla el borrado del usuario recién creado, registra su sub y propaga el error original de la contraseña", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const { client } = cognitoClient({
    AdminCreateUserCommand: createdUserResponse,
    AdminSetUserPasswordCommand: new InvalidPasswordException({
      message: "contraseña inválida una-clave-segura",
      $metadata: {},
    }),
    AdminDeleteUserCommand: new Error("Cognito no disponible"),
  });

  await assert.rejects(
    new CognitoIdentityProvider(client, USER_POOL_ID).createUserIfAbsent({
      email,
      password: "una-clave-segura",
    }),
    InvalidPasswordException,
  );
  assert.deepEqual(
    consoleError.mock.calls.map((call) => call.arguments),
    [["[cognito] quedó en Cognito un usuario sin contraseña:", COGNITO_SUB]],
  );
});

test("si Cognito no devuelve el sub, falla en vez de tratarlo como un correo existente", async () => {
  const { client } = cognitoClient({
    AdminCreateUserCommand: { User: { Attributes: [] } },
  });

  await assert.rejects(
    new CognitoIdentityProvider(client, USER_POOL_ID).createUserIfAbsent({
      email,
      password: "una-clave-segura",
    }),
    /no devolvió el sub/,
  );
});
