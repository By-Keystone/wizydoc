import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import {
  MINIMUM_REJECTED_SIGN_IN_MILLISECONDS,
  SignInUseCase,
} from "../../lib/src/users/application/sign-in.usecase";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import {
  INVALID_CREDENTIALS,
  SIGN_IN_FAILED,
  TOO_MANY_ATTEMPTS,
} from "../../lib/src/users/handlers/http-messages";
import { handleSignIn } from "../../lib/src/users/handlers/sign-in.http";
import {
  AllowingFirstAttempts,
  buildUser,
  CountingIpRateLimit,
  FakeClock,
  InMemoryCognitoSessions,
  InMemoryUsers,
} from "./fakes";

const EMAIL = "ana@clinica.pe";
const PASSWORD = "una-clave-segura";
const OTHER_SUB = "4b1c7a2e-0000-4000-8000-000000000002";

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

const signInFlow = (
  signInRateLimit:
    | CountingIpRateLimit
    | AllowingFirstAttempts = new CountingIpRateLimit(),
) => {
  const clock = new FakeClock();
  const sessions = new InMemoryCognitoSessions(clock);
  sessions.addAccount(EMAIL, PASSWORD);
  const users = new InMemoryUsers([buildUser()]);
  return {
    clock,
    sessions,
    users,
    signInRateLimit,
    signIn: new SignInUseCase(sessions, users, clock.now, clock.wait),
  };
};

const signIn = (
  flow: ReturnType<typeof signInFlow>,
  body: unknown = { email: EMAIL, password: PASSWORD },
  headers: Record<string, string> = {},
) => handleSignIn(event(body, headers), flow);

const timedSignIn = async (
  flow: ReturnType<typeof signInFlow>,
  body: unknown,
) => {
  const startedAt = flow.clock.now();
  const response = await signIn(flow, body);
  return { response, elapsed: flow.clock.now() - startedAt };
};

const withUnconfirmedAccount = (flow: ReturnType<typeof signInFlow>) => {
  flow.sessions.addAccount("sin@confirmar.pe", PASSWORD, OTHER_SUB);
  flow.users.users.push(
    buildUser({
      email: emailSchema.parse("sin@confirmar.pe"),
      cognitoSub: OTHER_SUB,
      confirmed: false,
    }),
  );
  return { email: "sin@confirmar.pe", password: PASSWORD };
};

test("iniciar sesión con el correo y la contraseña de una cuenta confirmada responde 200 con los tokens de Cognito y expiresIn de 900 segundos", async () => {
  const flow = signInFlow();

  const response = await signIn(flow);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    idToken: "id-token",
    accessToken: "access-token",
    refreshToken: "refresh-token-1",
    expiresIn: 900,
  });
});

test("el correo se recorta y se pasa a minúsculas antes de buscar la cuenta", async () => {
  const flow = signInFlow();

  const response = await signIn(flow, {
    email: "  Ana@Clinica.PE ",
    password: PASSWORD,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(flow.sessions.usernames, [EMAIL]);
});

test("un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar responden 401 con el mismo mensaje", async () => {
  const flow = signInFlow();
  const unconfirmed = withUnconfirmedAccount(flow);

  const responses = [
    await signIn(flow, { email: "nadie@clinica.pe", password: PASSWORD }),
    await signIn(flow, { email: EMAIL, password: "otra-clave" }),
    await signIn(flow, unconfirmed),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(JSON.parse(response.body), {
      message: INVALID_CREDENTIALS,
    });
    assert.deepEqual(response.headers, responses[0].headers);
  }
});

test("un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar tardan lo mismo en responder", async () => {
  const flow = signInFlow();
  const unconfirmed = withUnconfirmedAccount(flow);

  const elapsedTimes = [
    (await timedSignIn(flow, { email: "nadie@clinica.pe", password: PASSWORD }))
      .elapsed,
    (await timedSignIn(flow, { email: EMAIL, password: "otra-clave" })).elapsed,
    (await timedSignIn(flow, unconfirmed)).elapsed,
  ];

  assert.deepEqual(elapsedTimes, [
    MINIMUM_REJECTED_SIGN_IN_MILLISECONDS,
    MINIMUM_REJECTED_SIGN_IN_MILLISECONDS,
    MINIMUM_REJECTED_SIGN_IN_MILLISECONDS,
  ]);
});

test("un rechazo que ya tardó más que el mínimo no espera más, y iniciar sesión con éxito no espera", async () => {
  const flow = signInFlow();
  flow.sessions.wrongPasswordLatency =
    2 * MINIMUM_REJECTED_SIGN_IN_MILLISECONDS;

  const slowRejection = await timedSignIn(flow, {
    email: EMAIL,
    password: "otra-clave",
  });
  const success = await signIn(flow);

  assert.equal(
    slowRejection.elapsed,
    2 * MINIMUM_REJECTED_SIGN_IN_MILLISECONDS,
  );
  assert.equal(success.statusCode, 200);
  assert.deepEqual(flow.clock.waits, []);
});

test("a una cuenta sin confirmar no se le entrega ningún token aunque la contraseña sea correcta, y su refresh token se revoca", async () => {
  const flow = signInFlow();
  const unconfirmed = withUnconfirmedAccount(flow);
  flow.sessions.addAccount("sin@item.pe", PASSWORD, "sub-sin-item");

  const withoutConfirmation = await signIn(flow, unconfirmed);
  const withoutItem = await signIn(flow, {
    email: "sin@item.pe",
    password: PASSWORD,
  });

  for (const response of [withoutConfirmation, withoutItem]) {
    assert.equal(response.statusCode, 401);
    assert.doesNotMatch(response.body, /token/i);
  }
  assert.deepEqual(
    flow.sessions.revokedRefreshTokens,
    flow.sessions.issuedRefreshTokens,
  );
  assert.equal(flow.sessions.revokedRefreshTokens.length, 2);
});

test("si no se puede revocar el refresh token de una cuenta sin confirmar, igual responde 401", async (context) => {
  context.mock.method(console, "warn", () => {});
  const flow = signInFlow();
  const unconfirmed = withUnconfirmedAccount(flow);
  flow.sessions.failOnRevoke = new Error("Cognito no disponible");

  const response = await signIn(flow, unconfirmed);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { message: INVALID_CREDENTIALS });
});

test("el sexto intento de iniciar sesión en un minuto desde la misma IP responde 429 y no llega a Cognito", async () => {
  const flow = signInFlow(new AllowingFirstAttempts(5));
  const headers = { "x-real-ip": "190.42.10.7" };

  const statuses = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const { statusCode } = await signIn(
      flow,
      { email: EMAIL, password: "otra-clave" },
      headers,
    );
    statuses.push(statusCode);
  }

  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  assert.equal(flow.sessions.usernames.length, 5);
  assert.deepEqual(
    flow.signInRateLimit.ipAddresses,
    Array(6).fill("190.42.10.7"),
  );
});

test("mientras Cognito tiene bloqueada la cuenta por intentos fallidos, iniciar sesión responde 429", async () => {
  const flow = signInFlow();
  flow.sessions.lockOut(EMAIL);

  const response = await signIn(flow);

  assert.equal(response.statusCode, 429);
  assert.deepEqual(JSON.parse(response.body), { message: TOO_MANY_ATTEMPTS });
  assert.deepEqual(flow.clock.waits, []);
});

test("sin x-real-ip, los intentos de iniciar sesión cuentan en el cupo compartido", async () => {
  const flow = signInFlow();

  await signIn(flow);

  assert.deepEqual(flow.signInRateLimit.ipAddresses, [undefined]);
});

test("una entrada inválida responde 400 en español sin contar para el límite ni llegar a Cognito", async () => {
  const flow = signInFlow();
  const invalidBodies = [
    {
      body: { email: "no-es-un-correo", password: PASSWORD },
      message: "Correo inválido",
    },
    { body: { email: EMAIL, password: "" }, message: "Escribe tu contraseña." },
    { body: { email: EMAIL }, message: "Escribe tu contraseña." },
    {
      body: { email: EMAIL, password: "a".repeat(257) },
      message: "Escribe tu contraseña.",
    },
    { body: "no es json", message: INVALID_REQUEST },
    { body: [], message: INVALID_REQUEST },
  ];

  for (const { body, message } of invalidBodies) {
    const response = await signIn(flow, body);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { message });
  }
  assert.deepEqual(flow.signInRateLimit.ipAddresses, []);
  assert.deepEqual(flow.sessions.usernames, []);
});

test("una contraseña que no cumple las reglas del registro simplemente no coincide", async () => {
  const flow = signInFlow();

  const response = await signIn(flow, { email: EMAIL, password: "corta" });

  assert.equal(response.statusCode, 401);
});

test("si falla Cognito o DynamoDB, iniciar sesión responde 500 y no entrega ningún token", async (context) => {
  context.mock.method(console, "error", () => {});
  const cognitoDown = signInFlow();
  cognitoDown.sessions.failOnSignIn = new Error("Cognito no disponible");
  const dynamoDown = signInFlow();
  dynamoDown.users.failOnRead = true;

  for (const flow of [cognitoDown, dynamoDown]) {
    const response = await signIn(flow);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), { message: SIGN_IN_FAILED });
  }
});

test("ni la contraseña ni los tokens aparecen en los logs", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const consoleWarn = context.mock.method(console, "warn", () => {});
  const leakyMessage = `falló con ${PASSWORD} y refresh-token-1 y access-token`;
  const failingSignIn = signInFlow();
  failingSignIn.sessions.failOnSignIn = new Error(leakyMessage);
  const failingRevoke = signInFlow();
  const unconfirmed = withUnconfirmedAccount(failingRevoke);
  failingRevoke.sessions.failOnRevoke = new Error(leakyMessage);

  await signIn(failingSignIn);
  await signIn(failingRevoke, unconfirmed);

  const logged = JSON.stringify([
    ...consoleError.mock.calls.map((call) => call.arguments),
    ...consoleWarn.mock.calls.map((call) => call.arguments),
  ]);
  assert.ok(consoleError.mock.callCount() > 0);
  assert.ok(consoleWarn.mock.callCount() > 0);
  for (const secret of [PASSWORD, "refresh-token-1", "access-token", EMAIL]) {
    assert.equal(logged.includes(secret), false, secret);
  }
});
