import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorizeRequestUseCase } from "../../lib/src/users/application/authorize-request.usecase";
import { SavePlanUseCase } from "../../lib/src/users/application/save-plan.usecase";
import type { OnboardingStep } from "../../lib/src/users/domain/user.entity";
import {
  ONBOARDING_INCOMPLETE,
  PLAN_FAILED,
} from "../../lib/src/users/handlers/http-messages";
import { handleSavePlan } from "../../lib/src/users/handlers/save-plan.http";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryClinics,
  InMemoryOnboarding,
  InMemoryUsers,
  privateEvent,
  readDeclaredPolicy,
} from "./fakes";

const declaredPolicy = readDeclaredPolicy("SavePlanFunction");
const NOW = new Date("2026-11-12T15:00:00.000Z");

const bodyEvent = (body: unknown) =>
  privateEvent({ body: JSON.stringify(body) });

const planFlow = (onboardingStep: OnboardingStep = "PLAN") => {
  const user = buildUser({ onboardingStep });
  const users = new InMemoryUsers([user]);
  const onboarding = new InMemoryOnboarding(users);
  return {
    user,
    users,
    onboarding,
    call: (event = bodyEvent({ plan: "FREE" })) =>
      handleSavePlan(event, {
        authorizeRequest: new AuthorizeRequestUseCase(
          users,
          new InMemoryClinics(),
          declaredPolicy,
        ),
        savePlan: new SavePlanUseCase(onboarding, () => NOW),
      }),
  };
};

const body = (response: { body: string }) => JSON.parse(response.body);

test("guardar «Tu plan» con FREE crea el plan de la cuenta, indexado por plan, y pasa el paso a CLINIC en la misma transacción", async () => {
  const { call, user, onboarding } = planFlow("PLAN");

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "CLINIC" });
  assert.deepEqual(onboarding.subscriptions, [
    { accountId: user.accountId, plan: "FREE", createdAt: NOW },
  ]);
  assert.equal(user.onboardingStep, "CLINIC");
  assert.deepEqual(onboarding.transitions, [{ from: ["PLAN"], to: "CLINIC" }]);
});

test("durante la beta, un plan que no es FREE responde 400 y no guarda nada", async () => {
  for (const plan of ["CONSULTORIO", "CLINICA", "RED"]) {
    const { call, user, onboarding } = planFlow();

    const response = await call(bodyEvent({ plan }));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), {
      message: "Durante la beta, todas las cuentas empiezan en Gratis.",
    });
    assert.deepEqual(onboarding.transitions, []);
    assert.deepEqual(onboarding.subscriptions, []);
    assert.equal(user.onboardingStep, "PLAN");
  }
});

test("un plan que no existe o un cuerpo inválido responde 400 sin leer la sesión", async () => {
  const cases: [unknown, string][] = [
    [{ plan: "PLATINO" }, "Elige un plan."],
    [{}, "Elige un plan."],
    [{ plan: 1 }, "Elige un plan."],
  ];
  for (const [requestBody, message] of cases) {
    const flow = planFlow();
    flow.users.failOnRead = true;

    const response = await flow.call(bodyEvent(requestBody));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message });
  }
  const response = await planFlow().call(privateEvent({ body: "no es json" }));
  assert.equal(response.statusCode, 400);
  assert.deepEqual(body(response), { message: "La solicitud no es válida." });
});

test("con CLINIC y FREE responde 200 sin escribir", async () => {
  const { call, user, onboarding, users } = planFlow("CLINIC");

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "CLINIC" });
  assert.deepEqual(onboarding.transitions, []);
  assert.deepEqual(onboarding.subscriptions, []);
  assert.equal(users.users[0], user);
});

test("si pierde la carrera responde 200 con CLINIC", async () => {
  const { call, user, onboarding, users } = planFlow("PLAN");
  onboarding.beforeWrite = () => {
    users.users[0].onboardingStep = "CLINIC";
    onboarding.subscriptions.push({
      accountId: user.accountId,
      plan: "FREE",
      createdAt: NOW,
    });
  };

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "CLINIC" });
  assert.equal(onboarding.subscriptions.length, 1);
});

test("el plan se crea para la cuenta del usuario de la sesión, nunca la del cuerpo", async () => {
  const { call, user, onboarding } = planFlow("PLAN");

  await call(
    bodyEvent({ plan: "FREE", accountId: "01M6MSQWFCK15Q3X04AQEQ0AAA" }),
  );

  assert.deepEqual(
    onboarding.subscriptions.map(({ accountId }) => accountId),
    [user.accountId],
  );
});

test("cada ruta usada fuera de su paso responde 403 con el paso en que va el usuario", async () => {
  for (const step of ["PERSONAL_DATA", "SCHEDULE", "COMPLETED"] as const) {
    const { call, onboarding } = planFlow(step);

    const response = await call();

    assert.equal(response.statusCode, 403);
    assert.deepEqual(body(response), {
      message: ONBOARDING_INCOMPLETE,
      onboardingStep: step,
    });
    assert.deepEqual(onboarding.transitions, []);
    assert.deepEqual(onboarding.subscriptions, []);
  }
});

test("el ROUTE_POLICY declara los pasos PLAN y CLINIC y no exige membership", () => {
  assert.deepEqual(declaredPolicy, { onboardingStep: ["PLAN", "CLINIC"] });
});

test("si falla DynamoDB al escribir o al leer la sesión, responde 500 con el mensaje de la ruta", async (context) => {
  context.mock.method(console, "error", () => {});
  const failingWrite = planFlow();
  failingWrite.onboarding.failOnWrite = true;
  const failingRead = planFlow();
  failingRead.users.failOnRead = true;

  for (const flow of [failingWrite, failingRead]) {
    const response = await flow.call();

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body(response), { message: PLAN_FAILED });
  }
});

test("ni los datos personales ni los tokens aparecen en los logs", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  const flow = planFlow();
  const secrets = [
    "Ana",
    "987654321",
    "ana@clinica.pe",
    COGNITO_SUB,
    "eyJhbGciOi.token.firma",
  ];
  flow.onboarding.savePlan = async () => {
    throw new Error(`falló con ${secrets.join(" ")}`);
  };

  const response = await flow.call();

  const logged = JSON.stringify(
    errors.mock.calls.map((call) => call.arguments),
  );
  assert.equal(response.statusCode, 500);
  for (const secret of secrets) {
    assert.equal(logged.includes(secret), false, secret);
    assert.equal(response.body.includes(secret), false, secret);
  }
});
