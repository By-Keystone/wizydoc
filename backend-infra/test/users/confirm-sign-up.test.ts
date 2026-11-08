import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfirmSignUpUseCase,
  confirmSignUpInputSchemaFor,
  VERIFICATION_EXPIRED,
} from "../../lib/src/users/application/confirm-sign-up.usecase";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";
import {
  createSignUpVerificationToken,
  type SignUpVerificationToken,
} from "../../lib/src/users/domain/sign-up-verification-token.entity";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { CONFIRM_SIGN_UP_FAILED } from "../../lib/src/users/handlers/http-messages";
import { handleConfirmSignUp } from "../../lib/src/users/handlers/confirm-sign-up.http";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryIdentityProvider,
  InMemorySignUpVerificationTokens,
  InMemoryUsers,
  RecordingSessions,
} from "./fakes";

const email = emailSchema.parse("ana@clinica.pe");
const PASSWORD = "una-clave-segura";
const FIFTEEN_MINUTES_IN_MILLISECONDS = 15 * 60 * 1000;
const TERMS_FIELDS = {
  acceptedTerms: true,
  termsVersion: CURRENT_TERMS_VERSION,
  privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
};

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

const confirmationFlow = ({
  requireTermsAcceptance = false,
  existingUsers = [] as ReturnType<typeof buildUser>[],
  emailExistsInCognito = false,
} = {}) => {
  const verificationTokens = new InMemorySignUpVerificationTokens();
  const users = new InMemoryUsers(existingUsers, verificationTokens);
  const identityProvider = new InMemoryIdentityProvider(emailExistsInCognito);
  const sessions = new RecordingSessions();
  return {
    verificationTokens,
    users,
    identityProvider,
    sessions,
    inputSchema: confirmSignUpInputSchemaFor(requireTermsAcceptance),
    confirmSignUp: new ConfirmSignUpUseCase(
      verificationTokens,
      users,
      identityProvider,
      sessions,
      requireTermsAcceptance,
    ),
  };
};

const verified = (
  flow: ReturnType<typeof confirmationFlow>,
  verifiedEmail = email,
  now = new Date(),
): SignUpVerificationToken => {
  const verificationToken = createSignUpVerificationToken(verifiedEmail, now);
  flow.verificationTokens.add(verificationToken);
  return verificationToken;
};

const confirm = (
  flow: ReturnType<typeof confirmationFlow>,
  verificationToken: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  handleConfirmSignUp(
    event(
      {
        email: "ana@clinica.pe",
        password: PASSWORD,
        verificationToken,
        ...extra,
      },
      headers,
    ),
    flow,
  );

const assertNothingCreated = (flow: ReturnType<typeof confirmationFlow>) => {
  assert.deepEqual(flow.identityProvider.createdEmails, []);
  assert.deepEqual(flow.users.createdUsers, []);
  assert.deepEqual(flow.sessions.started, []);
};

test("crear la cuenta con un token de verificación vigente crea el usuario confirmado y sin nombre, apellido ni teléfono, gasta el token y responde 200 con los tokens de Cognito", async () => {
  const flow = confirmationFlow();
  const { token } = verified(flow);

  const response = await confirm(flow, token);
  const again = await confirm(flow, token);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    idToken: "id-token",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 3600,
  });
  const [user] = flow.users.createdUsers;
  assert.equal(user.email, email);
  assert.equal(user.confirmed, true);
  assert.equal(user.onboardingCompleted, false);
  assert.equal(user.cognitoSub, COGNITO_SUB);
  assert.equal(user.name, undefined);
  assert.equal(user.lastName, undefined);
  assert.equal(user.phone, undefined);
  assert.deepEqual(flow.identityProvider.createdEmails, ["ana@clinica.pe"]);
  assert.deepEqual(flow.identityProvider.passwords, [PASSWORD]);
  assert.deepEqual(flow.sessions.started, [
    { cognitoSub: COGNITO_SUB, password: PASSWORD },
  ]);
  assert.equal(again.statusCode, 400);
});

test("crear la cuenta sin token, con un token vencido, ya usado o de otro correo responde 400 y no crea nada", async () => {
  const withoutToken = confirmationFlow();
  const expired = confirmationFlow();
  const expiredToken = verified(
    expired,
    email,
    new Date(Date.now() - 2 * FIFTEEN_MINUTES_IN_MILLISECONDS),
  );
  const ofAnotherEmail = confirmationFlow();
  const anotherEmailToken = verified(
    ofAnotherEmail,
    emailSchema.parse("beto@clinica.pe"),
  );
  const unknown = confirmationFlow();
  const unknownToken = createSignUpVerificationToken(email);

  const responses = [
    await handleConfirmSignUp(
      event({ email: "ana@clinica.pe", password: PASSWORD }),
      withoutToken,
    ),
    await confirm(expired, expiredToken.token),
    await confirm(ofAnotherEmail, anotherEmailToken.token),
    await confirm(unknown, unknownToken.token),
  ];

  for (const response of responses) {
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), {
      message: VERIFICATION_EXPIRED,
    });
  }
  for (const flow of [withoutToken, expired, ofAnotherEmail, unknown]) {
    assertNothingCreated(flow);
  }
});

test("un correo que ya tiene cuenta responde 400 como un token que no sirve, sin tocar Cognito", async () => {
  const flow = confirmationFlow({ existingUsers: [buildUser()] });
  const { token } = verified(flow);

  const response = await confirm(flow, token);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    message: VERIFICATION_EXPIRED,
  });
  assertNothingCreated(flow);
});

test("si el correo ya existe en Cognito responde 400 como un token que no sirve, no borra nada y deja un aviso sin datos personales", async (context) => {
  const consoleWarn = context.mock.method(console, "warn", () => {});
  const flow = confirmationFlow({ emailExistsInCognito: true });
  const { token } = verified(flow);

  const response = await confirm(flow, token);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    message: VERIFICATION_EXPIRED,
  });
  assert.deepEqual(flow.identityProvider.deletedSubs, []);
  assert.deepEqual(flow.users.createdUsers, []);
  assert.deepEqual(
    consoleWarn.mock.calls.map((call) => call.arguments),
    [["[confirm-sign-up] el correo existe en Cognito pero no en DynamoDB"]],
  );
});

test("con el flag de los términos encendido, la constancia se guarda con el usuario y sin aceptar responde 400; apagado, se ignora", async () => {
  const withFlag = confirmationFlow({ requireTermsAcceptance: true });
  const { token } = verified(withFlag);
  const withoutAccepting = confirmationFlow({ requireTermsAcceptance: true });
  const { token: tokenWithoutAccepting } = verified(withoutAccepting);
  const withoutFlag = confirmationFlow();
  const { token: tokenWithoutFlag } = verified(withoutFlag);

  const accepted = await confirm(withFlag, token, TERMS_FIELDS, {
    "x-real-ip": "190.42.10.7",
    "user-agent": "Mozilla/5.0",
  });
  const rejected = await confirm(withoutAccepting, tokenWithoutAccepting);
  const ignored = await confirm(withoutFlag, tokenWithoutFlag);

  assert.equal(accepted.statusCode, 200);
  const [acceptance] = withFlag.users.termsAcceptances;
  assert.equal(acceptance.userId, withFlag.users.createdUsers[0].id);
  assert.equal(acceptance.ipAddress, "190.42.10.7");
  assert.equal(acceptance.userAgent, "Mozilla/5.0");
  assert.equal(rejected.statusCode, 400);
  assert.deepEqual(JSON.parse(rejected.body), {
    message: "Para crear tu cuenta, acepta los Términos y condiciones.",
  });
  assertNothingCreated(withoutAccepting);
  assert.equal(ignored.statusCode, 200);
  assert.deepEqual(withoutFlag.users.termsAcceptances, []);
});

test("de dos confirmaciones a la vez con el mismo token, sólo una crea la cuenta y la otra responde 400 sin borrar nada", async () => {
  const flow = confirmationFlow();
  const { token } = verified(flow);

  const responses = await Promise.all([
    confirm(flow, token),
    confirm(flow, token),
  ]);

  assert.deepEqual(
    responses.map(({ statusCode }) => statusCode).sort(),
    [200, 400],
  );
  assert.equal(flow.users.createdUsers.length, 1);
  assert.deepEqual(flow.identityProvider.deletedSubs, []);
});

test("si el token se gasta entre su lectura y la transacción, responde 400 y borra de Cognito su propio usuario por su sub", async () => {
  const flow = confirmationFlow();
  const { token } = verified(flow);
  flow.verificationTokens.isValidFor = async () => true;
  const spent = confirmationFlow();
  flow.verificationTokens.consume = spent.verificationTokens.consume.bind(
    spent.verificationTokens,
  );

  const response = await confirm(flow, token);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    message: VERIFICATION_EXPIRED,
  });
  assert.deepEqual(flow.users.createdUsers, []);
  assert.deepEqual(flow.identityProvider.deletedSubs, [COGNITO_SUB]);
  assert.deepEqual(flow.sessions.started, []);
});

test("si falla la escritura en DynamoDB, el usuario se borra de Cognito por su sub y responde 500", async () => {
  const flow = confirmationFlow();
  flow.users.failOnCreate = true;
  const { token } = verified(flow);

  const response = await confirm(flow, token);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), {
    message: CONFIRM_SIGN_UP_FAILED,
  });
  assert.deepEqual(flow.identityProvider.deletedSubs, [COGNITO_SUB]);
  assert.deepEqual(flow.sessions.started, []);
});

test("si Cognito no entrega los tokens, la cuenta queda creada y responde 204", async () => {
  const flow = confirmationFlow();
  flow.sessions.failure = new Error("Cognito no disponible");
  const { token } = verified(flow);

  const response = await confirm(flow, token);

  assert.deepEqual(response, { statusCode: 204, body: "" });
  assert.equal(flow.users.createdUsers.length, 1);
  assert.deepEqual(flow.identityProvider.deletedSubs, []);
});

test("una entrada inválida responde 400 en español sin llamar a nada", async () => {
  const flow = confirmationFlow();

  for (const [body, message] of [
    ["", "La solicitud no es válida."],
    [{ email: "no-es-un-correo", password: PASSWORD }, "Correo inválido"],
    [
      { email: "ana@clinica.pe", password: "corta", verificationToken: "x" },
      "La contraseña debe tener al menos 8 caracteres",
    ],
    [
      {
        email: "ana@clinica.pe",
        password: PASSWORD,
        verificationToken: "corto",
      },
      VERIFICATION_EXPIRED,
    ],
  ] as const) {
    const response = await handleConfirmSignUp(event(body), flow);
    assert.equal(response.statusCode, 400, JSON.stringify(body));
    assert.deepEqual(JSON.parse(response.body), { message });
  }
  assertNothingCreated(flow);
});

test("si falla algo, el log sólo trae el nombre del error, sin la contraseña, el token, su hash ni los tokens de Cognito", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const failingTransaction = confirmationFlow();
  const failingSession = confirmationFlow();
  const first = verified(failingTransaction);
  const second = verified(failingSession);
  failingTransaction.users.createConfirmed = async () => {
    throw new Error(
      `falló con ${PASSWORD}, ${first.token} y ${first.tokenHash}`,
    );
  };
  failingSession.sessions.failure = new Error(
    `falló con ${PASSWORD}, ${second.token}, id-token y refresh-token`,
  );

  await confirm(failingTransaction, first.token);
  await confirm(failingSession, second.token);

  assert.deepEqual(
    consoleError.mock.calls.map((call) => call.arguments),
    [
      ["[confirm-sign-up] falló la creación de la cuenta:", "Error"],
      [
        "[confirm-sign-up] la cuenta quedó creada pero no se pudo iniciar la sesión:",
        "Error",
      ],
    ],
  );
});
