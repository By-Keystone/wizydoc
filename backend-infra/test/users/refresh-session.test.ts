import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import { RefreshSessionUseCase } from "../../lib/src/users/application/refresh-session.usecase";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import {
  SESSION_EXPIRED,
  SESSION_REFRESH_FAILED,
} from "../../lib/src/users/handlers/http-messages";
import { handleRefreshSession } from "../../lib/src/users/handlers/refresh-session.http";
import { InMemoryCognitoSessions } from "./fakes";

const EMAIL = emailSchema.parse("ana@clinica.pe");
const PASSWORD = "una-clave-segura";

const refreshFlow = async () => {
  const sessions = new InMemoryCognitoSessions();
  sessions.addAccount(EMAIL, PASSWORD);
  const attempt = await sessions.signIn({ email: EMAIL, password: PASSWORD });
  assert.equal(attempt.kind, "accepted");
  return {
    sessions,
    refreshToken: sessions.issuedRefreshTokens[0],
    refreshSession: new RefreshSessionUseCase(sessions),
  };
};

const refresh = (
  flow: Awaited<ReturnType<typeof refreshFlow>>,
  body: unknown = { refreshToken: flow.refreshToken },
) =>
  handleRefreshSession(
    {
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: {},
    },
    flow,
  );

test("renovar con un refresh token vigente responde 200 con un ID token y un access token nuevos y sin refresh token, y el mismo refresh token sigue sirviendo", async () => {
  const flow = await refreshFlow();

  const first = await refresh(flow);
  const second = await refresh(flow);

  for (const response of [first, second]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers?.["cache-control"], "no-store");
    assert.deepEqual(JSON.parse(response.body), {
      idToken: "id-token-renovado",
      accessToken: "access-token-renovado",
      expiresIn: 900,
    });
  }
});

test("renovar con un refresh token vencido, revocado o inválido responde 401", async () => {
  const flow = await refreshFlow();
  flow.sessions.expire(flow.refreshToken);
  const revoked = await refreshFlow();
  await revoked.sessions.revoke(revoked.refreshToken);

  const responses = [
    await refresh(flow),
    await refresh(revoked),
    await refresh(flow, { refreshToken: "inventado" }),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 401);
    assert.deepEqual(JSON.parse(response.body), { message: SESSION_EXPIRED });
  }
});

test("una entrada inválida responde 400 sin llegar a Cognito", async () => {
  const flow = await refreshFlow();

  for (const body of [
    "no es json",
    [],
    {},
    { refreshToken: "" },
    { refreshToken: 7 },
  ]) {
    const response = await refresh(flow, body);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
  }
  assert.deepEqual(flow.sessions.refreshedWith, []);
});

test("si falla Cognito, renovar responde 500", async (context) => {
  context.mock.method(console, "error", () => {});
  const flow = await refreshFlow();
  flow.sessions.failOnRefresh = new Error("Cognito no disponible");

  const response = await refresh(flow);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), {
    message: SESSION_REFRESH_FAILED,
  });
});

test("ni la contraseña ni los tokens aparecen en los logs", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const flow = await refreshFlow();
  flow.sessions.failOnRefresh = new Error(
    `falló con ${PASSWORD} y ${flow.refreshToken} y access-token`,
  );

  await refresh(flow);

  const logged = JSON.stringify(
    consoleError.mock.calls.map((call) => call.arguments),
  );
  assert.ok(consoleError.mock.callCount() > 0);
  for (const secret of [PASSWORD, flow.refreshToken, "access-token"]) {
    assert.equal(logged.includes(secret), false, secret);
  }
});
