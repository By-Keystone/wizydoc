import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import {
  type SignUpRequest,
  SignUpUseCase,
  signUpInputSchemaFor,
} from "../../lib/src/users/application/sign-up.usecase";
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../../lib/src/users/domain/legal-documents";
import {
  SIGN_UP_FAILED,
  TOO_MANY_ATTEMPTS,
} from "../../lib/src/users/handlers/http-messages";
import { handleSignUp } from "../../lib/src/users/handlers/sign-up.http";
import {
  buildUser,
  CountingIpRateLimit,
  InMemoryIdentityProvider,
  InMemoryUsers,
  RecordingEmails,
} from "./fakes";

const validBody = {
  email: "ana@clinica.pe",
  name: "Ana",
  lastName: "Pérez",
  phone: "987654321",
  password: "una-clave-segura",
};

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

class RecordingSignUp {
  readonly requests: SignUpRequest[] = [];

  constructor(private readonly failure?: Error) {}

  async execute(request: SignUpRequest): Promise<void> {
    this.requests.push(request);
    if (this.failure) throw this.failure;
  }
}

interface DependencyOverrides {
  signUp?: Pick<SignUpUseCase, "execute">;
  emailSendAttempts?: CountingIpRateLimit;
  requireTermsAcceptance?: boolean;
}

const dependencies = ({
  signUp = new RecordingSignUp(),
  emailSendAttempts = new CountingIpRateLimit(),
  requireTermsAcceptance = false,
}: DependencyOverrides = {}) => ({
  inputSchema: signUpInputSchemaFor(requireTermsAcceptance),
  emailSendAttempts,
  signUp,
});

test("pasa la IP y el navegador al caso de uso", async () => {
  const signUp = new RecordingSignUp();

  await handleSignUp(
    event(validBody, {
      "X-Real-IP": "190.42.10.7",
      "User-Agent": "Mozilla/5.0",
    }),
    dependencies({ signUp }),
  );

  assert.equal(signUp.requests[0].ipAddress, "190.42.10.7");
  assert.equal(signUp.requests[0].userAgent, "Mozilla/5.0");
});

test("una IP que no es válida se trata como si faltara la cabecera", async () => {
  const signUp = new RecordingSignUp();
  const emailSendAttempts = new CountingIpRateLimit();

  await handleSignUp(
    event(validBody, { "x-real-ip": "no-es-una-ip<script>" }),
    dependencies({ signUp, emailSendAttempts }),
  );

  assert.deepEqual(emailSendAttempts.ipAddresses, [undefined]);
  assert.equal(signUp.requests[0].ipAddress, undefined);
});

test("la respuesta es idéntica con un correo nuevo, confirmado, sin confirmar o sólo en Cognito", async () => {
  const scenarios = [
    {
      users: new InMemoryUsers(),
      identityProvider: new InMemoryIdentityProvider(),
    },
    {
      users: new InMemoryUsers([buildUser({ confirmed: true })]),
      identityProvider: new InMemoryIdentityProvider(),
    },
    {
      users: new InMemoryUsers([buildUser({ confirmed: false })]),
      identityProvider: new InMemoryIdentityProvider(),
    },
    {
      users: new InMemoryUsers(),
      identityProvider: new InMemoryIdentityProvider(true),
    },
  ];

  const responses = await Promise.all(
    scenarios.map(({ users, identityProvider }) =>
      handleSignUp(
        event(validBody),
        dependencies({
          signUp: new SignUpUseCase(
            users,
            identityProvider,
            new RecordingEmails(),
            false,
          ),
        }),
      ),
    ),
  );

  for (const response of responses) {
    assert.deepEqual(response, { statusCode: 202, body: "" });
  }
});

test("si el registro falla, responde 500 en español", async () => {
  const response = await handleSignUp(
    event(validBody),
    dependencies({
      signUp: new RecordingSignUp(new Error("SES no disponible")),
    }),
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), { message: SIGN_UP_FAILED });
});

test("una entrada inválida responde 400 en español, no llama al caso de uso y no cuenta para el límite", async () => {
  const signUp = new RecordingSignUp();
  const emailSendAttempts = new CountingIpRateLimit();
  const invalidBodies = ["{no es json", "", "null", "[]", "1"];

  const invalidPhone = await handleSignUp(
    event({ ...validBody, phone: "12345" }),
    dependencies({ signUp, emailSendAttempts }),
  );
  assert.equal(invalidPhone.statusCode, 400);
  assert.match(JSON.parse(invalidPhone.body).message, /^Escribe un celular/);

  for (const body of invalidBodies) {
    const response = await handleSignUp(
      event(body),
      dependencies({ signUp, emailSendAttempts }),
    );
    assert.equal(response.statusCode, 400, body);
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
  }

  assert.deepEqual(signUp.requests, []);
  assert.deepEqual(emailSendAttempts.ipAddresses, []);
});

test("con el flag encendido y versiones que no son las vigentes, responde 400 sin llamar al caso de uso", async () => {
  const signUp = new RecordingSignUp();

  const response = await handleSignUp(
    event({
      ...validBody,
      acceptedTerms: true,
      termsVersion: "2025-01-01",
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    }),
    dependencies({ signUp, requireTermsAcceptance: true }),
  );
  const accepted = await handleSignUp(
    event({
      ...validBody,
      acceptedTerms: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
    }),
    dependencies({ signUp, requireTermsAcceptance: true }),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    message: "Actualizamos los términos. Recarga la página para verlos.",
  });
  assert.equal(accepted.statusCode, 202);
  assert.equal(signUp.requests.length, 1);
});

test("si se superó el límite de la IP, responde 429 sin llamar al caso de uso", async () => {
  const signUp = new RecordingSignUp();
  const emailSendAttempts = new CountingIpRateLimit(false);

  const response = await handleSignUp(
    event(validBody, { "x-real-ip": "190.42.10.7" }),
    dependencies({ signUp, emailSendAttempts }),
  );

  assert.equal(response.statusCode, 429);
  assert.deepEqual(JSON.parse(response.body), { message: TOO_MANY_ATTEMPTS });
  assert.deepEqual(emailSendAttempts.ipAddresses, ["190.42.10.7"]);
  assert.deepEqual(signUp.requests, []);
});

test("el log de un error no incluye su mensaje", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});

  await handleSignUp(
    event(validBody),
    dependencies({
      signUp: new RecordingSignUp(
        new Error("falló con ana@clinica.pe y una-clave-segura"),
      ),
    }),
  );

  const logged = JSON.stringify(
    consoleError.mock.calls.map((call) => call.arguments),
  );
  assert.equal(logged.includes("ana@clinica.pe"), false);
  assert.equal(logged.includes("una-clave-segura"), false);
});
