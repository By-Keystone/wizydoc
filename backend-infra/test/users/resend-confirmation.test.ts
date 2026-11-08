import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import { ResendConfirmationUseCase } from "../../lib/src/users/application/resend-confirmation.usecase";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import { handleResendConfirmation } from "../../lib/src/users/handlers/resend-confirmation.http";
import {
  buildUser,
  CountingIpRateLimit,
  InMemoryUsers,
  RecordingEmails,
} from "./fakes";

const email = emailSchema.parse("ana@clinica.pe");

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

test("con un correo sin confirmar crea un token nuevo y envía la confirmación", async () => {
  const unconfirmedUser = buildUser({ confirmed: false });
  const users = new InMemoryUsers([unconfirmedUser]);
  const emails = new RecordingEmails();

  await new ResendConfirmationUseCase(users, emails).execute({ email });

  assert.equal(users.savedTokens.length, 1);
  assert.equal(users.savedTokens[0].userId, unconfirmedUser.id);
  assert.deepEqual(
    emails.sent.map((sent) => sent.kind),
    ["confirmation"],
  );
});

test("con un correo confirmado o inexistente no envía nada, y la respuesta es idéntica a la de un correo sin confirmar", async () => {
  const scenarios = [
    new InMemoryUsers([buildUser({ confirmed: false })]),
    new InMemoryUsers([buildUser({ confirmed: true })]),
    new InMemoryUsers(),
  ];
  const emailsByScenario = scenarios.map(() => new RecordingEmails());

  const responses = await Promise.all(
    scenarios.map((users, index) =>
      handleResendConfirmation(event({ email: "ana@clinica.pe" }), {
        emailSendAttempts: new CountingIpRateLimit(),
        resendConfirmation: new ResendConfirmationUseCase(
          users,
          emailsByScenario[index],
        ),
      }),
    ),
  );

  for (const response of responses) {
    assert.deepEqual(response, { statusCode: 202, body: "" });
  }
  assert.equal(emailsByScenario[0].sent.length, 1);
  assert.deepEqual(emailsByScenario[1].sent, []);
  assert.deepEqual(emailsByScenario[2].sent, []);
});

test("una entrada que no es un objeto responde 400 en español sin contar para el límite", async () => {
  const emailSendAttempts = new CountingIpRateLimit();

  for (const body of ["", "null", "{no es json"]) {
    const response = await handleResendConfirmation(event(body), {
      emailSendAttempts,
      resendConfirmation: new ResendConfirmationUseCase(
        new InMemoryUsers(),
        new RecordingEmails(),
      ),
    });
    assert.equal(response.statusCode, 400, body);
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
  }
  assert.deepEqual(emailSendAttempts.ipAddresses, []);
});

test("el reenvío también cuenta para el límite de la IP", async () => {
  const emails = new RecordingEmails();
  const emailSendAttempts = new CountingIpRateLimit(false);

  const response = await handleResendConfirmation(
    event({ email: "ana@clinica.pe" }, { "x-real-ip": "190.42.10.7" }),
    {
      emailSendAttempts,
      resendConfirmation: new ResendConfirmationUseCase(
        new InMemoryUsers([buildUser({ confirmed: false })]),
        emails,
      ),
    },
  );

  assert.equal(response.statusCode, 429);
  assert.deepEqual(emailSendAttempts.ipAddresses, ["190.42.10.7"]);
  assert.deepEqual(emails.sent, []);
});
