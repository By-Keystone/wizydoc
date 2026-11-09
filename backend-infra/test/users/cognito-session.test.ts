import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  InvalidParameterException,
  NotAuthorizedException,
  UnsupportedTokenTypeException,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoSessionProvider } from "../../lib/src/users/infrastructure/identity-provider/cognito/cognito-session";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { COGNITO_SUB, cognitoClient, idTokenFor } from "./fakes";

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

const signInResult = {
  AuthenticationResult: {
    IdToken: idTokenFor(COGNITO_SUB),
    AccessToken: "access-token",
    RefreshToken: "refresh-token",
    ExpiresIn: 900,
  },
};
const EMAIL = emailSchema.parse("ana@clinica.pe");
const EMAIL_SECRET_HASH = createHmac("sha256", CLIENT_SECRET)
  .update(EMAIL + settings.clientId)
  .digest("base64");

const rejection = (message: string) =>
  new NotAuthorizedException({ message, $metadata: {} });

test("inicia la sesión con el correo como USERNAME y el SECRET_HASH calculado con el correo, y devuelve el sub del ID token con los tokens", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: signInResult,
  });

  const attempt = await new CognitoSessionProvider(client, settings).signIn({
    email: EMAIL,
    password: PASSWORD,
  });

  assert.deepEqual(attempt, {
    kind: "accepted",
    cognitoSub: COGNITO_SUB,
    session: {
      idToken: idTokenFor(COGNITO_SUB),
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 900,
    },
  });
  const auth = sent.find(({ name }) => name === "AdminInitiateAuthCommand");
  assert.deepEqual(auth?.input.AuthParameters, {
    USERNAME: EMAIL,
    PASSWORD: PASSWORD,
    SECRET_HASH: EMAIL_SECRET_HASH,
  });
});

test("NotAuthorizedException es una contraseña rechazada, salvo Password attempts exceeded", async () => {
  for (const message of [
    "Incorrect username or password.",
    "User is disabled.",
  ]) {
    const { client } = cognitoClient({
      DescribeUserPoolClientCommand: describedClient,
      AdminInitiateAuthCommand: rejection(message),
    });

    assert.deepEqual(
      await new CognitoSessionProvider(client, settings).signIn({
        email: EMAIL,
        password: PASSWORD,
      }),
      { kind: "rejected" },
      message,
    );
  }
});

test("si falla la lectura del secreto del cliente, el error sube y no se toma como una contraseña rechazada", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: rejection("Not authorized to describe"),
  });

  await assert.rejects(
    new CognitoSessionProvider(client, settings).signIn({
      email: EMAIL,
      password: PASSWORD,
    }),
    NotAuthorizedException,
  );
  assert.ok(!sent.some(({ name }) => name === "AdminInitiateAuthCommand"));
});

test("Password attempts exceeded es una cuenta bloqueada", async () => {
  const { client } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: rejection("Password attempts exceeded"),
  });

  assert.deepEqual(
    await new CognitoSessionProvider(client, settings).signIn({
      email: EMAIL,
      password: PASSWORD,
    }),
    { kind: "locked-out" },
  );
});

test("al iniciar sesión, un desafío, tokens incompletos, un ID token sin sub o cualquier otro error de Cognito suben sin valores", async () => {
  const failures = [
    { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "sesion-secreta" },
    { AuthenticationResult: { IdToken: idTokenFor(COGNITO_SUB) } },
    {
      AuthenticationResult: {
        ...signInResult.AuthenticationResult,
        IdToken: idTokenFor(undefined),
      },
    },
    new Error("TooManyRequestsException"),
  ];

  for (const failure of failures) {
    const { client } = cognitoClient({
      DescribeUserPoolClientCommand: describedClient,
      AdminInitiateAuthCommand: failure,
    });

    await assert.rejects(
      new CognitoSessionProvider(client, settings).signIn({
        email: EMAIL,
        password: PASSWORD,
      }),
      (error: Error) =>
        !error.message.includes(PASSWORD) &&
        !error.message.includes("sesion-secreta") &&
        !error.message.includes("access-token"),
    );
  }
});

test("revoca con RevokeToken y el secreto del cliente", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
  });

  await new CognitoSessionProvider(client, settings).revoke("refresh-token");

  assert.deepEqual(
    sent.find(({ name }) => name === "RevokeTokenCommand")?.input,
    {
      ClientId: settings.clientId,
      ClientSecret: CLIENT_SECRET,
      Token: "refresh-token",
    },
  );
});

test("cualquier otro error de RevokeToken sube", async () => {
  const { client } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    RevokeTokenCommand: new Error("InternalErrorException"),
  });

  await assert.rejects(
    new CognitoSessionProvider(client, settings).revoke("refresh-token"),
    { message: "InternalErrorException" },
  );
});

test("al revocar, UnsupportedTokenTypeException y un token fuera del patrón de Cognito no son errores", async () => {
  const unsupported = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    RevokeTokenCommand: new UnsupportedTokenTypeException({
      message: "access token",
      $metadata: {},
    }),
  });
  const outsidePattern = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
  });

  await new CognitoSessionProvider(unsupported.client, settings).revoke(
    "access-token",
  );
  await new CognitoSessionProvider(outsidePattern.client, settings).revoke(
    "token con espacios",
  );

  assert.deepEqual(outsidePattern.sent, []);
});

const refreshedResult = {
  AuthenticationResult: {
    IdToken: "id-token-nuevo",
    AccessToken: "access-token-nuevo",
    ExpiresIn: 900,
  },
};

test("renueva con GetTokensFromRefreshToken y el secreto del cliente, sin SECRET_HASH ni usuario", async () => {
  const { client, sent } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    GetTokensFromRefreshTokenCommand: {
      AuthenticationResult: {
        ...refreshedResult.AuthenticationResult,
        RefreshToken: "refresh-token-rotado",
      },
    },
  });

  const refreshed = await new CognitoSessionProvider(client, settings).refresh(
    "refresh-token",
  );

  assert.deepEqual(refreshed, {
    idToken: "id-token-nuevo",
    accessToken: "access-token-nuevo",
    expiresIn: 900,
  });
  assert.deepEqual(
    sent.find(({ name }) => name === "GetTokensFromRefreshTokenCommand")?.input,
    {
      ClientId: settings.clientId,
      ClientSecret: CLIENT_SECRET,
      RefreshToken: "refresh-token",
    },
  );
});

test("al renovar, NotAuthorizedException es un token que no sirve, y un token fuera del patrón de Cognito no llega a Cognito", async () => {
  const notAuthorized = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    GetTokensFromRefreshTokenCommand: rejection(
      "Refresh Token has been revoked",
    ),
  });
  const outsidePattern = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
  });

  assert.equal(
    await new CognitoSessionProvider(notAuthorized.client, settings).refresh(
      "refresh-token",
    ),
    undefined,
  );
  assert.equal(
    await new CognitoSessionProvider(outsidePattern.client, settings).refresh(
      "token con espacios",
    ),
    undefined,
  );
  assert.deepEqual(outsidePattern.sent, []);
});

test("al renovar, tokens incompletos, un error de configuración o la lectura fallida del secreto suben sin valores", async () => {
  const failures = [
    { AuthenticationResult: { IdToken: "id-token-nuevo" } },
    new InvalidParameterException({
      message: "mala configuración",
      $metadata: {},
    }),
    new Error("TooManyRequestsException"),
  ];

  for (const failure of failures) {
    const { client } = cognitoClient({
      DescribeUserPoolClientCommand: describedClient,
      GetTokensFromRefreshTokenCommand: failure,
    });

    await assert.rejects(
      new CognitoSessionProvider(client, settings).refresh("refresh-token"),
      (error: Error) =>
        !error.message.includes("id-token-nuevo") &&
        !error.message.includes("refresh-token"),
    );
  }
  const secretFailure = cognitoClient({
    DescribeUserPoolClientCommand: rejection("Not authorized to describe"),
  });
  await assert.rejects(
    new CognitoSessionProvider(secretFailure.client, settings).refresh(
      "refresh-token",
    ),
    NotAuthorizedException,
  );
});

test("un NotAuthorizedException inesperado sigue siendo un rechazo, y deja un aviso sin su mensaje", async (context) => {
  const consoleWarn = context.mock.method(console, "warn", () => {});
  const { client } = cognitoClient({
    DescribeUserPoolClientCommand: describedClient,
    AdminInitiateAuthCommand: rejection("mensaje nuevo de Cognito"),
  });

  const attempt = await new CognitoSessionProvider(client, settings).signIn({
    email: EMAIL,
    password: PASSWORD,
  });

  assert.deepEqual(attempt, { kind: "rejected" });
  assert.equal(consoleWarn.mock.callCount(), 1);
  assert.equal(
    JSON.stringify(consoleWarn.mock.calls[0].arguments).includes(
      "mensaje nuevo",
    ),
    false,
  );
});
