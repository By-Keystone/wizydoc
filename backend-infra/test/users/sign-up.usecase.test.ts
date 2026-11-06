import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SignUpUseCase,
  signUpInputSchemaFor,
} from "../../lib/src/users/application/sign-up.usecase";
import { hashConfirmationToken } from "../../lib/src/users/domain/confirmation-token.entity";
import {
  CURRENT_CHECKBOX_TEXT_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryIdentityProvider,
  InMemoryUsers,
  RecordingEmails,
} from "./fakes";

const PASSWORD = "una-clave-segura";
const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

const input = signUpInputSchemaFor(false).parse({
  email: "  Ana@Clinica.PE ",
  name: " Ana ",
  lastName: "Pérez",
  phone: "987 654 321",
  password: PASSWORD,
});

const signUpScenario = ({
  users = new InMemoryUsers(),
  identityProvider = new InMemoryIdentityProvider(),
  emails = new RecordingEmails(),
  requireTermsAcceptance = false,
} = {}) => ({
  users,
  identityProvider,
  emails,
  signUp: new SignUpUseCase(
    users,
    identityProvider,
    emails,
    requireTermsAcceptance,
  ),
});

test("con un correo nuevo crea el usuario en Cognito y en DynamoDB, sin confirmar", async () => {
  const { users, identityProvider, signUp } = signUpScenario();

  await signUp.execute({ input });

  assert.deepEqual(identityProvider.createdEmails, ["ana@clinica.pe"]);
  assert.equal(users.createdUsers.length, 1);
  const [user] = users.createdUsers;
  assert.equal(user.cognitoSub, COGNITO_SUB);
  assert.equal(user.confirmed, false);
  assert.equal(user.onboardingCompleted, false);
});

test("guarda el correo recortado y en minúsculas, y el teléfono como +51", async () => {
  const { users, signUp } = signUpScenario();

  await signUp.execute({ input });

  const [user] = users.createdUsers;
  assert.equal(user.email, "ana@clinica.pe");
  assert.equal(user.name, "Ana");
  assert.equal(user.phone, "+51987654321");
});

test("con un correo nuevo envía la confirmación con un token que se guarda con hash y vence a las 24 horas", async () => {
  const { users, emails, signUp } = signUpScenario();
  const startedAt = Date.now();

  await signUp.execute({ input });

  assert.equal(emails.sent.length, 1);
  const [email] = emails.sent;
  assert.equal(email.kind, "confirmation");
  assert.equal(email.to, "ana@clinica.pe");
  const [savedToken] = users.savedTokens;
  assert.equal(email.confirmationToken, savedToken);
  assert.equal(savedToken.tokenHash, hashConfirmationToken(savedToken.token));
  assert.equal(savedToken.userId, users.createdUsers[0].id);
  const lifetime = savedToken.expiresAt.getTime() - startedAt;
  assert.ok(lifetime >= 24 * HOUR_IN_MILLISECONDS - 1000);
  assert.ok(lifetime <= 24 * HOUR_IN_MILLISECONDS + 1000);
});

test("con el flag encendido guarda la constancia junto con el usuario, con la hora del servidor", async () => {
  const { users, signUp } = signUpScenario({ requireTermsAcceptance: true });
  const longUserAgent = "Mozilla/5.0 ".repeat(60);
  const startedAt = Date.now();

  await signUp.execute({
    input,
    ipAddress: "190.42.10.7",
    userAgent: longUserAgent,
  });

  assert.equal(users.termsAcceptances.length, 1);
  const [termsAcceptance] = users.termsAcceptances;
  assert.equal(termsAcceptance.userId, users.createdUsers[0].id);
  assert.equal(termsAcceptance.email, "ana@clinica.pe");
  assert.equal(termsAcceptance.termsVersion, CURRENT_TERMS_VERSION);
  assert.equal(
    termsAcceptance.privacyPolicyVersion,
    CURRENT_PRIVACY_POLICY_VERSION,
  );
  assert.equal(
    termsAcceptance.checkboxTextVersion,
    CURRENT_CHECKBOX_TEXT_VERSION,
  );
  assert.equal(termsAcceptance.ipAddress, "190.42.10.7");
  assert.equal(termsAcceptance.userAgent?.length, 512);
  assert.equal(termsAcceptance.source, "sign-up");
  const acceptedAt = termsAcceptance.acceptedAt.getTime();
  assert.ok(acceptedAt >= startedAt && acceptedAt <= Date.now());
});

test("con un correo confirmado envía el aviso y no crea ni modifica nada", async () => {
  const { users, identityProvider, emails, signUp } = signUpScenario({
    users: new InMemoryUsers([buildUser({ confirmed: true })]),
  });

  await signUp.execute({ input });

  assert.deepEqual(identityProvider.createdEmails, []);
  assert.deepEqual(users.createdUsers, []);
  assert.deepEqual(users.savedTokens, []);
  assert.deepEqual(
    emails.sent.map((email) => email.kind),
    ["account-exists"],
  );
});

test("con un correo sin confirmar envía el aviso con un enlace nuevo para confirmar, sin cambiar sus datos ni su constancia", async () => {
  const unconfirmedUser = buildUser({ confirmed: false });
  const { users, identityProvider, emails, signUp } = signUpScenario({
    users: new InMemoryUsers([unconfirmedUser]),
    requireTermsAcceptance: true,
  });

  await signUp.execute({ input, ipAddress: "203.0.113.9" });

  assert.deepEqual(identityProvider.createdEmails, []);
  assert.deepEqual(users.createdUsers, []);
  assert.deepEqual(users.termsAcceptances, []);
  assert.equal(users.savedTokens.length, 1);
  assert.equal(users.savedTokens[0].userId, unconfirmedUser.id);
  assert.deepEqual(
    emails.sent.map((email) => email.kind),
    ["pending-confirmation"],
  );
});

test("con un correo que sólo existe en Cognito no guarda ni envía nada, y lo deja en el log", async (context) => {
  const consoleWarn = context.mock.method(console, "warn", () => {});
  const { users, emails, signUp } = signUpScenario({
    identityProvider: new InMemoryIdentityProvider(true),
  });

  await signUp.execute({ input });

  assert.deepEqual(users.createdUsers, []);
  assert.deepEqual(emails.sent, []);
  assert.equal(consoleWarn.mock.callCount(), 1);
  const logged = JSON.stringify(consoleWarn.mock.calls[0].arguments);
  assert.equal(logged.includes("ana@clinica.pe"), false);
});

test("si falla el guardado, borra el usuario de Cognito, no envía nada y propaga el error", async () => {
  const users = new InMemoryUsers();
  users.failOnCreate = true;
  const { identityProvider, emails, signUp } = signUpScenario({ users });

  await assert.rejects(signUp.execute({ input }), /DynamoDB no disponible/);
  assert.deepEqual(identityProvider.deletedSubs, [COGNITO_SUB]);
  assert.deepEqual(emails.sent, []);
});

test("si además falla el borrado en Cognito, propaga el error original y deja el sub en el log", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const users = new InMemoryUsers();
  users.failOnCreate = true;
  const identityProvider = new InMemoryIdentityProvider();
  identityProvider.failOnDelete = true;
  const { signUp } = signUpScenario({ users, identityProvider });

  await assert.rejects(signUp.execute({ input }), /DynamoDB no disponible/);
  const logged = JSON.stringify(
    consoleError.mock.calls.map((call) => call.arguments),
  );
  assert.ok(logged.includes(COGNITO_SUB));
});

test("si falla el envío del correo, el reintento manda un enlace nuevo para confirmar", async () => {
  const emails = new RecordingEmails();
  emails.failOnSend = true;
  const { users, signUp } = signUpScenario({ emails });

  await assert.rejects(signUp.execute({ input }), /SES no disponible/);
  emails.failOnSend = false;
  await signUp.execute({ input });

  assert.equal(users.createdUsers.length, 1);
  assert.equal(users.savedTokens.length, 2);
  assert.deepEqual(
    emails.sent.map((email) => email.kind),
    ["pending-confirmation"],
  );
});

test("la contraseña sólo llega a Cognito", async () => {
  const { users, identityProvider, signUp } = signUpScenario({
    requireTermsAcceptance: true,
  });

  await signUp.execute({ input });

  assert.deepEqual(identityProvider.passwords, [PASSWORD]);
  const stored = JSON.stringify([
    users.createdUsers,
    users.termsAcceptances,
    users.savedTokens,
  ]);
  assert.equal(stored.includes(PASSWORD), false);
});

test("con el flag apagado no guarda constancia", async () => {
  const { users, signUp } = signUpScenario({ requireTermsAcceptance: false });

  await signUp.execute({ input, ipAddress: "190.42.10.7" });

  assert.equal(users.createdUsers.length, 1);
  assert.deepEqual(users.termsAcceptances, []);
});
