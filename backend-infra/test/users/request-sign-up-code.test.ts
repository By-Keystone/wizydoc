import assert from "node:assert/strict";
import { test } from "node:test";
import { INVALID_REQUEST } from "../../lib/src/shared/messages";
import { RequestSignUpCodeUseCase } from "../../lib/src/users/application/request-sign-up-code.usecase";
import {
  createSignUpCode,
  hashSignUpCode,
} from "../../lib/src/users/domain/sign-up-code.entity";
import { emailSchema } from "../../lib/src/users/domain/value-objects/email.vo";
import {
  SIGN_UP_CODE_FAILED,
  TOO_MANY_ATTEMPTS,
} from "../../lib/src/users/handlers/http-messages";
import { handleRequestSignUpCode } from "../../lib/src/users/handlers/request-sign-up-code.http";
import {
  AllowingFirstAttempts,
  buildUser,
  CountingIpRateLimit,
  InMemoryAccountExistsNotices,
  InMemorySignUpCodes,
  InMemoryUsers,
  RecordingEmails,
} from "./fakes";

const email = emailSchema.parse("ana@clinica.pe");

const event = (body: unknown, headers: Record<string, string> = {}) => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers,
});

const requestFlow = ({
  users = new InMemoryUsers(),
  signUpCodes = new InMemorySignUpCodes(),
  accountExistsNotices = new InMemoryAccountExistsNotices(),
  emails = new RecordingEmails(),
  emailSendAttempts = new CountingIpRateLimit(),
} = {}) => ({
  users,
  signUpCodes,
  accountExistsNotices,
  emails,
  emailSendAttempts,
  requestSignUpCode: new RequestSignUpCodeUseCase(
    users,
    signUpCodes,
    accountExistsNotices,
    emails,
  ),
});

test("pedir el código con un correo sin cuenta guarda sólo su hash, con vencimiento a los 10 minutos, y envía el correo con el código", async () => {
  const flow = requestFlow();
  const before = Date.now();

  const response = await handleRequestSignUpCode(
    event({ email: " Ana@Clinica.PE " }),
    flow,
  );

  assert.deepEqual(response, { statusCode: 202, body: "" });
  const [saved] = flow.signUpCodes.saved;
  const [sent] = flow.emails.sent;
  assert.equal(sent.kind, "sign-up-code");
  assert.equal(sent.to, "ana@clinica.pe");
  assert.match(sent.code ?? "", /^\d{6}$/);
  assert.equal(saved.email, email);
  assert.equal(saved.codeHash, hashSignUpCode(sent.code ?? ""));
  assert.equal(saved.attempts, 0);
  const lifetimeInMinutes = (saved.expiresAt.getTime() - before) / 60_000;
  assert.ok(lifetimeInMinutes >= 10 && lifetimeInMinutes < 10.1);
});

test("pedir otro código antes de que pase un minuto no guarda ni envía nada y responde 202", async () => {
  const flow = requestFlow({ signUpCodes: new InMemorySignUpCodes(true) });

  const response = await handleRequestSignUpCode(
    event({ email: "ana@clinica.pe" }),
    flow,
  );

  assert.deepEqual(response, { statusCode: 202, body: "" });
  assert.deepEqual(flow.signUpCodes.saved, []);
  assert.deepEqual(flow.emails.sent, []);
});

test("pedir otro código pasado un minuto lo guarda y envía el nuevo", async () => {
  const flow = requestFlow();

  await flow.requestSignUpCode.execute({ email });
  await flow.requestSignUpCode.execute({ email });

  assert.equal(flow.signUpCodes.saved.length, 2);
  assert.deepEqual(
    flow.emails.sent.map(({ code }) => code),
    flow.signUpCodes.saved.map(({ code }) => code),
  );
});

test("pedir el código con un correo con cuenta antes de que pase un minuto desde el último aviso no envía nada y responde 202", async () => {
  const flow = requestFlow({
    users: new InMemoryUsers([buildUser()]),
    accountExistsNotices: new InMemoryAccountExistsNotices(true),
  });

  const response = await handleRequestSignUpCode(
    event({ email: "ana@clinica.pe" }),
    flow,
  );

  assert.deepEqual(response, { statusCode: 202, body: "" });
  assert.deepEqual(flow.emails.sent, []);
  assert.deepEqual(flow.signUpCodes.saved, []);
});

test("el aviso a un correo con cuenta se registra antes de enviarse, una vez por pedido", async () => {
  const flow = requestFlow({ users: new InMemoryUsers([buildUser()]) });

  await flow.requestSignUpCode.execute({ email });

  assert.deepEqual(flow.accountExistsNotices.registered, ["ana@clinica.pe"]);
  assert.equal(flow.emails.sent.length, 1);
});

test("el código tiene siempre 6 dígitos, también con ceros a la izquierda", () => {
  for (let attempt = 0; attempt < 2000; attempt++) {
    assert.match(createSignUpCode(email).code, /^\d{6}$/);
  }
});

test("un usuario sin confirmar cuenta como un correo con cuenta: no se guarda ni se crea nada", async () => {
  const unconfirmedUser = buildUser({ confirmed: false });
  const flow = requestFlow({ users: new InMemoryUsers([unconfirmedUser]) });

  await flow.requestSignUpCode.execute({ email });

  assert.deepEqual(flow.signUpCodes.saved, []);
  assert.deepEqual(flow.users.createdUsers, []);
  assert.deepEqual(
    flow.emails.sent.map(({ kind }) => kind),
    ["account-exists"],
  );
});

test("pedir el código con un correo que ya tiene cuenta no guarda nada y envía «Intentaron crear una cuenta con tu correo», con la misma respuesta que con un correo sin cuenta", async () => {
  const withAccount = requestFlow({ users: new InMemoryUsers([buildUser()]) });
  const withoutAccount = requestFlow();

  const responses = await Promise.all(
    [withAccount, withoutAccount].map((flow) =>
      handleRequestSignUpCode(event({ email: "ana@clinica.pe" }), flow),
    ),
  );

  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(withAccount.signUpCodes.saved, []);
  assert.deepEqual(
    withAccount.emails.sent.map(({ kind, to }) => ({ kind, to })),
    [{ kind: "account-exists", to: "ana@clinica.pe" }],
  );
});

test("el cuarto envío de correo en 10 minutos desde la misma IP responde 429 y no guarda ni envía nada", async () => {
  const emailSendAttempts = new AllowingFirstAttempts(3);
  const flow = { ...requestFlow(), emailSendAttempts };

  const statusCodes: number[] = [];
  for (let request = 0; request < 4; request++) {
    const response = await handleRequestSignUpCode(
      event(
        { email: `ana${request}@clinica.pe` },
        { "x-real-ip": "190.42.10.7" },
      ),
      flow,
    );
    statusCodes.push(response.statusCode);
    if (response.statusCode === 429) {
      assert.deepEqual(JSON.parse(response.body), {
        message: TOO_MANY_ATTEMPTS,
      });
    }
  }

  assert.deepEqual(statusCodes, [202, 202, 202, 429]);
  assert.equal(flow.signUpCodes.saved.length, 3);
  assert.equal(flow.emails.sent.length, 3);
});

test("una entrada inválida responde 400 en español sin contar para el límite", async () => {
  const flow = requestFlow();

  for (const body of ["", "null", "{no es json", "[]"]) {
    const response = await handleRequestSignUpCode(event(body), flow);
    assert.equal(response.statusCode, 400, JSON.stringify(body));
    assert.deepEqual(JSON.parse(response.body), { message: INVALID_REQUEST });
  }
  for (const body of [
    { email: "no-es-un-correo" },
    { email: `${"a".repeat(65)}@clinica.pe` },
    { email: 42 },
    {},
  ]) {
    const response = await handleRequestSignUpCode(event(body), flow);
    assert.equal(response.statusCode, 400, JSON.stringify(body));
    assert.deepEqual(JSON.parse(response.body), { message: "Correo inválido" });
  }
  assert.deepEqual(flow.emailSendAttempts.ipAddresses, []);
  assert.deepEqual(flow.signUpCodes.saved, []);
});

test("si falla DynamoDB o el envío responde 500 y el log sólo trae el nombre del error, sin el código, su hash ni el correo", async (context) => {
  const consoleError = context.mock.method(console, "error", () => {});
  const failingDynamo = requestFlow();
  failingDynamo.signUpCodes.saveUnlessRequestedRecently = async ({
    code,
    codeHash,
    email,
  }) => {
    throw new Error(`falló con ${code}, ${codeHash} y ${email}`);
  };
  const failingSes = requestFlow();
  failingSes.emails.sendSignUpCode = async ({ code, codeHash, email }) => {
    throw new Error(`falló con ${code}, ${codeHash} y ${email}`);
  };

  for (const flow of [failingDynamo, failingSes]) {
    const response = await handleRequestSignUpCode(
      event({ email: "ana@clinica.pe" }),
      flow,
    );
    assert.equal(response.statusCode, 500);
    assert.deepEqual(JSON.parse(response.body), {
      message: SIGN_UP_CODE_FAILED,
    });
  }

  assert.deepEqual(
    consoleError.mock.calls.map((call) => call.arguments),
    [
      ["[sign-up-code] falló el pedido del código:", "Error"],
      ["[sign-up-code] falló el pedido del código:", "Error"],
    ],
  );
});
