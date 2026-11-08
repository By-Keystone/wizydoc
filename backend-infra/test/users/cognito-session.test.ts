import assert from "node:assert/strict";
import { test } from "node:test";
import { CognitoSessionProvider } from "../../lib/src/users/infrastructure/identity-provider/cognito/cognito-session";
import { COGNITO_SUB, cognitoClient } from "./fakes";

const settings = { userPoolId: "us-east-2_ejemplo", clientId: "cliente-1" };
const CLIENT_SECRET = "secreto-del-cliente";
const PASSWORD = "una-clave-segura";
const EXPECTED_SECRET_HASH = "5TGNGoXCpCb2NN95/mZRba4NCkkKsv6Ocpu5UBBl5iQ=";

const describedClient = {
  UserPoolClient: { ClientSecret: CLIENT_SECRET },
};
const authenticationResult = {
  AuthenticationResult: {
    IdToken: "id-token",
    AccessToken: "access-token",
    RefreshToken: "refresh-token",
    ExpiresIn: 3600,
  },
};

test("inicia la sesión con ADMIN_USER_PASSWORD_AUTH y el SECRET_HASH calculado con el secreto del cliente, y devuelve los tokens de Cognito", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: authenticationResult,
  });

  const session = await new CognitoSessionProvider(client, settings).start({
    cognitoSub: COGNITO_SUB,
    password: PASSWORD,
  });

  assert.deepEqual(session, {
    idToken: "id-token",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 3600,
  });
  const auth = sent.find(({ name }) => name === "AdminInitiateAuthCommand");
  assert.deepEqual(auth?.input, {
    UserPoolId: settings.userPoolId,
    ClientId: settings.clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: COGNITO_SUB,
      PASSWORD: PASSWORD,
      SECRET_HASH: EXPECTED_SECRET_HASH,
    },
  });
});

test("lee el secreto del cliente una sola vez por instancia", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: authenticationResult,
  });
  const provider = new CognitoSessionProvider(client, settings);

  await provider.start({ cognitoSub: COGNITO_SUB, password: PASSWORD });
  await provider.start({ cognitoSub: COGNITO_SUB, password: PASSWORD });

  assert.equal(
    sent.filter(({ name }) => name === "DescribeUserPoolClientCommand").length,
    1,
  );
});

test("si Cognito no entrega los tokens completos, falla sin incluir ningún valor en el error", async () => {
  const { client } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: {
      AuthenticationResult: { IdToken: "id-token" },
    },
  });

  await assert.rejects(
    new CognitoSessionProvider(client, settings).start({
      cognitoSub: COGNITO_SUB,
      password: PASSWORD,
    }),
    (error: Error) =>
      !error.message.includes("id-token") && !error.message.includes(PASSWORD),
  );
});

test("si el cliente no tiene secreto, falla antes de iniciar la sesión", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: { UserPoolClient: {} },
  });

  await assert.rejects(
    new CognitoSessionProvider(client, settings).start({
      cognitoSub: COGNITO_SUB,
      password: PASSWORD,
    }),
  );
  assert.equal(
    sent.some(({ name }) => name === "AdminInitiateAuthCommand"),
    false,
  );
});
