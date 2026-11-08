import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import { RequestSignUpCodeUseCase } from "../../lib/src/users/application/request-sign-up-code.usecase";
import {
  INVALID_SIGN_UP_CODE,
  VerifySignUpCodeUseCase,
} from "../../lib/src/users/application/verify-sign-up-code.usecase";
import {
  createSignUpCode,
  SIGN_UP_CODE_MAX_ATTEMPTS,
  type SignUpCode,
} from "../../lib/src/users/domain/sign-up-code.entity";
import { hashSignUpVerificationToken } from "../../lib/src/users/domain/sign-up-verification-token.entity";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import {
  SIGN_UP_CODE_VERIFICATION_FAILED,
  TOO_MANY_ATTEMPTS,
} from "../../lib/src/users/handlers/http-messages";
import { handleVerifySignUpCode } from "../../lib/src/users/handlers/verify-sign-up-code.http";
import {
  AllowingFirstAttempts,
  CountingIpRateLimit,
  InMemoryAccountExistsNotices,
  InMemorySignUpCodes,
  InMemoryUsers,
  RecordingEmails,
} from "./fakes";

const email = emailSchema.parse("ana@clinica.pe");
const WRONG_CODE = "000000";
const BASE64URL_256_BITS = /^[A-Za-z0-9_-]{43}$/;
const ELEVEN_MINUTES_IN_MILLISECONDS = 11 * 60 * 1000;

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

const requestedCode = async (
  signUpCodes: InMemorySignUpCodes,
  requestedAt = new Date(),
  codeEmail = email,
): Promise<SignUpCode> => {
  const signUpCode = createSignUpCode(codeEmail, requestedAt);
  await signUpCodes.saveUnlessRequestedRecently(signUpCode);
  return signUpCode;
};

const verificationFlow = (
  signUpCodes = new InMemorySignUpCodes(),
  verificationRateLimit:
    | CountingIpRateLimit
    | AllowingFirstAttempts = new CountingIpRateLimit(),
) => ({
  signUpCodes,
  verificationRateLimit,
  verifySignUpCode: new VerifySignUpCodeUseCase(signUpCodes),
});

const verify = (
  flow: ReturnType<typeof verificationFlow>,
  code: string,
  codeEmail = "ana@clinica.pe",
) => handleVerifySignUpCode(event({ email: codeEmail, code }), flow);

test("verificar el código correcto responde 200 con un token de verificación y gasta el código: verificarlo otra vez responde 400", async () => {
  const flow = verificationFlow();
  const { code } = await requestedCode(flow.signUpCodes);

  const first = await verify(flow, code);
  const second = await verify(flow, code);

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers?.["cache-control"], "no-store");
  const { verificationToken } = JSON.parse(first.body);
  assert.match(verificationToken, BASE64URL_256_BITS);
  const [stored] = flow.signUpCodes.verificationTokens;
  assert.equal(
    stored.tokenHash,
    hashSignUpVerificationToken(verificationToken),
  );
  assert.equal(stored.email, email);
  const lifetimeInMinutes = (stored.expiresAt.getTime() - Date.now()) / 60_000;
  assert.ok(lifetimeInMinutes > 14.9 && lifetimeInMinutes <= 15);
  assert.equal(second.statusCode, 400);
  assert.deepEqual(JSON.parse(second.body), { message: INVALID_SIGN_UP_CODE });
});

test("un código incorrecto, vencido, con los intentos agotados, ya usado o que nunca se pidió responde 400 con el mismo mensaje", async () => {
  const wrong = verificationFlow();
  await requestedCode(wrong.signUpCodes);
  const expired = verificationFlow();
  const expiredCode = await requestedCode(
    expired.signUpCodes,
    new Date(Date.now() - ELEVEN_MINUTES_IN_MILLISECONDS),
  );
  const exhausted = verificationFlow();
  const exhaustedCode = await requestedCode(exhausted.signUpCodes);
  for (let attempt = 0; attempt < SIGN_UP_CODE_MAX_ATTEMPTS; attempt++) {
    await verify(exhausted, WRONG_CODE);
  }
  const used = verificationFlow();
  const usedCode = await requestedCode(used.signUpCodes);
  await verify(used, usedCode.code);
  const neverRequested = verificationFlow();

  const responses = [
    await verify(wrong, WRONG_CODE),
    await verify(expired, expiredCode.code),
    await verify(exhausted, exhaustedCode.code),
    await verify(used, usedCode.code),
    await verify(neverRequested, WRONG_CODE),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), {
      message: INVALID_SIGN_UP_CODE,
    });
  }
});

test("al quinto intento fallido el código deja de servir aunque sea el correcto, pero el quinto intento todavía puede acertar", async () => {
  const afterFourFailures = verificationFlow();
  const fourthChance = await requestedCode(afterFourFailures.signUpCodes);
  for (let attempt = 0; attempt < SIGN_UP_CODE_MAX_ATTEMPTS - 1; attempt++) {
    await verify(afterFourFailures, WRONG_CODE);
  }
  const afterFiveFailures = verificationFlow();
  const lastChance = await requestedCode(afterFiveFailures.signUpCodes);
  for (let attempt = 0; attempt < SIGN_UP_CODE_MAX_ATTEMPTS; attempt++) {
    await verify(afterFiveFailures, WRONG_CODE);
  }

  assert.equal(
    (await verify(afterFourFailures, fourthChance.code)).statusCode,
    200,
  );
  assert.equal(
    (await verify(afterFiveFailures, lastChance.code)).statusCode,
    400,
  );
});

test("N verificaciones incorrectas en paralelo evalúan 5 como mucho", async () => {
  const flow = verificationFlow();
  const { code } = await requestedCode(flow.signUpCodes);

  await Promise.all(Array.from({ length: 20 }, () => verify(flow, WRONG_CODE)));

  assert.equal(flow.signUpCodes.attemptsCounted.length, 5);
  assert.equal((await verify(flow, code)).statusCode, 400);
});

test("de dos verificaciones a la vez con el mismo código, sólo una recibe el token", async () => {
  const flow = verificationFlow();
  const { code } = await requestedCode(flow.signUpCodes);

  const responses = await Promise.all([verify(flow, code), verify(flow, code)]);

  assert.deepEqual(
    responses.map(({ statusCode }) => statusCode).sort(),
    [200, 400],
  );
  assert.equal(flow.signUpCodes.verificationTokens.length, 1);
});

test("después de pedir otro código, el anterior responde 400 y el nuevo sirve", async () => {
  const flow = verificationFlow();
  const previous = await requestedCode(flow.signUpCodes);
  const latest = await requestedCode(flow.signUpCodes);

  assert.equal((await verify(flow, previous.code)).statusCode, 400);
  assert.equal((await verify(flow, latest.code)).statusCode, 200);
});

test("pedir otro código antes de que pase un minuto no guarda nada y el anterior sigue sirviendo", async () => {
  const flow = verificationFlow();
  const emails = new RecordingEmails();
  const requestSignUpCode = new RequestSignUpCodeUseCase(
    new InMemoryUsers(),
    flow.signUpCodes,
    new InMemoryAccountExistsNotices(),
    emails,
  );
  await requestSignUpCode.execute({ email });
  const [{ code: firstCode }] = emails.sent;
  flow.signUpCodes.isOnCooldown = true;

  await requestSignUpCode.execute({ email });
  const response = await verify(flow, firstCode ?? "");

  assert.equal(emails.sent.length, 1);
  assert.equal(flow.signUpCodes.saved.length, 1);
  assert.equal(response.statusCode, 200);
});

test("la undécima verificación de una IP responde 429 y no cuenta como intento del código", async () => {
  const verificationRateLimit = new AllowingFirstAttempts(10);
  const flow = verificationFlow(
    new InMemorySignUpCodes(),
    verificationRateLimit,
  );
  for (let request = 0; request < 11; request++) {
    await requestedCode(
      flow.signUpCodes,
      new Date(),
      emailSchema.parse(`ana${request}@clinica.pe`),
    );
  }

  const statusCodes: number[] = [];
  for (let request = 0; request < 11; request++) {
    const response = await verify(flow, WRONG_CODE, `ana${request}@clinica.pe`);
    statusCodes.push(response.statusCode);
    if (response.statusCode === 429) {
      assert.deepEqual(JSON.parse(response.body), {
        message: TOO_MANY_ATTEMPTS,
      });
    }
  }

  assert.deepEqual(statusCodes, [...Array(10).fill(400), 429]);
  assert.equal(flow.signUpCodes.attemptsCounted.length, 10);
});

test("una entrada inválida responde 400 en español sin contar para el límite ni como intento", async () => {
  const flow = verificationFlow();
  await requestedCode(flow.signUpCodes);

  for (const body of ["", "null", "{no es json", "[]"]) {
    const response = await handleVerifySignUpCode(event(body), flow);
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
    assert.equal(response.statusCode, 400);
  }
  for (const body of [
    { email: "no-es-un-correo", code: "123456" },
    { code: "123456" },
  ]) {
    const response = await handleVerifySignUpCode(event(body), flow);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { message: "Correo inválido" });
  }
  for (const code of ["12345", "1234567", "12345a", " 123456", 123456, null]) {
    const response = await handleVerifySignUpCode(
      event({ email: "ana@clinica.pe", code }),
      flow,
    );
    assert.equal(response.statusCode, 400, String(code));
    assert.deepEqual(JSON.parse(response.body), {
      message: INVALID_SIGN_UP_CODE,
    });
  }
  assert.deepEqual(flow.verificationRateLimit.ipAddresses, []);
  assert.deepEqual(flow.signUpCodes.attemptsCounted, []);
});

test("si falla DynamoDB responde 500 y el log sólo trae el nombre del error, sin el código, el token, sus hashes ni el correo", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const flow = verificationFlow();
  const signUpCode = await requestedCode(flow.signUpCodes);
  flow.signUpCodes.registerAttemptAndReadCodeHash = async () => {
    throw new Error(
      `falló con ${signUpCode.code}, ${signUpCode.codeHash} y ${email}`,
    );
  };
  const failingTransaction = verificationFlow();
  const secondCode = await requestedCode(failingTransaction.signUpCodes);
  failingTransaction.signUpCodes.spendForVerificationToken = async (
    _email,
    codeHash,
    { token, tokenHash },
  ) => {
    throw new Error(
      `falló con ${secondCode.code}, ${codeHash}, ${token}, ${tokenHash} y ${email}`,
    );
  };

  const responses = [
    await verify(flow, signUpCode.code),
    await verify(failingTransaction, secondCode.code),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), {
      message: SIGN_UP_CODE_VERIFICATION_FAILED,
    });
  }
  assert.deepEqual(
    consoleError.mock.calls.map((call) => call.arguments),
    [
      ["[verify-sign-up-code] falló la verificación:", "Error"],
      ["[verify-sign-up-code] falló la verificación:", "Error"],
    ],
  );
});
