import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import { RefreshSessionUseCase } from "../../lib/src/users/application/refresh-session.usecase";
import { SignOutUseCase } from "../../lib/src/users/application/sign-out.usecase";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { SIGN_OUT_FAILED } from "../../lib/src/users/handlers/http-messages";
import { handleRefreshSession } from "../../lib/src/users/handlers/refresh-session.http";
import { handleSignOut } from "../../lib/src/users/handlers/sign-out.http";
import { InMemoryCognitoSessions } from "./fakes";

const EMAIL = emailSchema.parse("ana@clinica.pe");
const PASSWORD = "una-clave-segura";

const signOutFlow = async () => {
  const sessions = new InMemoryCognitoSessions();
  sessions.addAccount(EMAIL, PASSWORD);
  await sessions.signIn({ email: EMAIL, password: PASSWORD });
  await sessions.signIn({ email: EMAIL, password: PASSWORD });
  const [refreshToken, otherDeviceRefreshToken] = sessions.issuedRefreshTokens;
  return {
    sessions,
    refreshToken,
    otherDeviceRefreshToken,
    signOut: new SignOutUseCase(sessions),
    refreshSession: new RefreshSessionUseCase(sessions),
  };
};

type Flow = Awaited<ReturnType<typeof signOutFlow>>;

const requestBody = (body: unknown) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers: {},
});

const signOut = (
  flow: Flow,
  body: unknown = { refreshToken: flow.refreshToken },
) => handleSignOut(requestBody(body), flow);

const refresh = (flow: Flow, refreshToken: string) =>
  handleRefreshSession(requestBody({ refreshToken }), flow);

test("cerrar la sesión revoca el refresh token: renovar con él después responde 401", async () => {
  const flow = await signOutFlow();

  const response = await signOut(flow);

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, "");
  assert.deepEqual(flow.sessions.revokedRefreshTokens, [flow.refreshToken]);
  assert.equal((await refresh(flow, flow.refreshToken)).statusCode, 401);
});

test("cerrar la sesión no cierra la de otro dispositivo", async () => {
  const flow = await signOutFlow();

  await signOut(flow);

  assert.equal(
    (await refresh(flow, flow.otherDeviceRefreshToken)).statusCode,
    200,
  );
});

test("cerrar la sesión con un refresh token que ya no servía responde 204", async () => {
  const flow = await signOutFlow();
  flow.sessions.expire(flow.otherDeviceRefreshToken);

  const responses = [
    await signOut(flow),
    await signOut(flow),
    await signOut(flow, { refreshToken: flow.otherDeviceRefreshToken }),
    await signOut(flow, { refreshToken: "inventado" }),
    await signOut(flow, { refreshToken: "token con espacios" }),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 204);
  }
});

test("si Cognito falla al revocar, cerrar la sesión responde 500", async (context) => {
  context.mock.method(console, "error", () => {});
  const flow = await signOutFlow();
  flow.sessions.failOnRevoke = new Error("Cognito no disponible");

  const response = await signOut(flow);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), { message: SIGN_OUT_FAILED });
});

test("una entrada inválida responde 400 sin llegar a Cognito", async () => {
  const flow = await signOutFlow();

  for (const body of [
    "no es json",
    [],
    {},
    { refreshToken: "" },
    { refreshToken: 7 },
  ]) {
    const response = await signOut(flow, body);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
  }
  assert.deepEqual(flow.sessions.revokedRefreshTokens, []);
});

test("ni la contraseña ni los tokens aparecen en los logs", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const flow = await signOutFlow();
  flow.sessions.failOnRevoke = new Error(
    `falló con ${PASSWORD} y ${flow.refreshToken} y access-token`,
  );

  await signOut(flow);

  const logged = JSON.stringify(
    consoleError.mock.calls.map((call) => call.arguments),
  );
  assert.ok(consoleError.mock.callCount() > 0);
  for (const secret of [PASSWORD, flow.refreshToken, "access-token"]) {
    assert.equal(logged.includes(secret), false, secret);
  }
});
