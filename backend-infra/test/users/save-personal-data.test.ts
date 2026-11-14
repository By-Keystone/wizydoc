import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorizeRequestUseCase } from "../../lib/src/users/application/authorize-request.usecase";
import { SavePersonalDataUseCase } from "../../lib/src/users/application/save-personal-data.usecase";
import type { OnboardingStep } from "../../lib/src/users/domain/user.entity";
import {
  ONBOARDING_INCOMPLETE,
  PERSONAL_DATA_FAILED,
} from "../../lib/src/users/handlers/http-messages";
import { handleSavePersonalData } from "../../lib/src/users/handlers/save-personal-data.http";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryClinics,
  InMemoryOnboarding,
  InMemoryUsers,
  privateEvent,
  readDeclaredPolicy,
} from "./fakes";

const declaredPolicy = readDeclaredPolicy("SavePersonalDataFunction");

const validBody = {
  givenName: "  Ana ",
  familyName: "Pérez",
  phone: "987 654 321",
  treatment: "DRA",
};

const bodyEvent = (body: unknown) =>
  privateEvent({ body: JSON.stringify(body) });

const personalDataFlow = (onboardingStep: OnboardingStep = "PERSONAL_DATA") => {
  const user = buildUser({ onboardingStep });
  const users = new InMemoryUsers([user]);
  const onboarding = new InMemoryOnboarding(users);
  return {
    user,
    users,
    onboarding,
    call: (event = bodyEvent(validBody)) =>
      handleSavePersonalData(event, {
        authorizeRequest: new AuthorizeRequestUseCase(
          users,
          new InMemoryClinics(),
          declaredPolicy,
        ),
        savePersonalData: new SavePersonalDataUseCase(onboarding),
      }),
  };
};

const body = (response: { body: string }) => JSON.parse(response.body);

test("guardar «Tus datos» con PERSONAL_DATA guarda el nombre, el apellido, el celular con +51 y el tratamiento, y pasa el paso a PLAN", async () => {
  const { call, user } = personalDataFlow("PERSONAL_DATA");

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "PLAN" });
  assert.equal(user.givenName, "Ana");
  assert.equal(user.familyName, "Pérez");
  assert.equal(user.phone, "+51987654321");
  assert.equal(user.treatment, "DRA");
  assert.equal(user.onboardingStep, "PLAN");
});

test("guardar «Tus datos» sin tratamiento guarda null", async () => {
  const { call, user } = personalDataFlow();

  const response = await call(
    bodyEvent({ ...validBody, treatment: undefined }),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(user.treatment, null);
});

test("guardar «Tus datos» con PLAN o CLINIC corrige los datos sin cambiar el paso", async () => {
  for (const step of ["PLAN", "CLINIC"] as const) {
    const { call, user } = personalDataFlow(step);

    const response = await call(
      bodyEvent({ ...validBody, givenName: "Lucía", treatment: null }),
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(body(response), { onboardingStep: step });
    assert.equal(user.givenName, "Lucía");
    assert.equal(user.treatment, null);
    assert.equal(user.onboardingStep, step);
  }
});

test("un celular que no es de Perú, o un nombre vacío, responde 400 y no guarda nada", async () => {
  const invalidBodies = [
    { ...validBody, phone: "+1 415 555 2671" },
    { ...validBody, phone: "" },
    { ...validBody, givenName: "   " },
    { ...validBody, familyName: "" },
  ];
  for (const invalidBody of invalidBodies) {
    const { call, user, onboarding } = personalDataFlow();

    const response = await call(bodyEvent(invalidBody));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(onboarding.transitions, []);
    assert.equal(user.givenName, undefined);
    assert.equal(user.onboardingStep, "PERSONAL_DATA");
  }
});

test("el 400 lleva el mensaje del primer campo inválido", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ givenName: "" }, "Escribe tu nombre."],
    [
      { givenName: "a".repeat(101) },
      "El nombre no puede tener más de 100 caracteres.",
    ],
    [{ familyName: "" }, "Escribe tu apellido."],
    [
      { familyName: "a".repeat(101) },
      "El apellido no puede tener más de 100 caracteres.",
    ],
    [{ phone: "" }, "Escribe tu celular."],
    [
      { phone: "12345" },
      "Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.",
    ],
    [{ treatment: "PROF" }, "Tratamiento inválido"],
  ];
  for (const [override, message] of cases) {
    const response = await personalDataFlow().call(
      bodyEvent({ ...validBody, ...override }),
    );

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message });
  }
});

test("un cuerpo que no es un objeto JSON responde 400 con «La solicitud no es válida.»", async () => {
  for (const event of [
    privateEvent({ body: null }),
    privateEvent({ body: "no es json" }),
    privateEvent({ body: JSON.stringify(["Ana"]) }),
  ]) {
    const response = await personalDataFlow().call(event);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message: "La solicitud no es válida." });
  }
});

test("con el cuerpo inválido y el paso equivocado responde 400, sin leer la sesión", async () => {
  const flow = personalDataFlow("COMPLETED");
  flow.users.failOnRead = true;

  const response = await flow.call(bodyEvent({ ...validBody, givenName: "" }));

  assert.equal(response.statusCode, 400);
});

test("la ruta usada fuera de sus pasos responde 403 con el paso en que va el usuario y no guarda nada", async () => {
  for (const step of ["SCHEDULE", "COMPLETED"] as const) {
    const { call, user, onboarding } = personalDataFlow(step);

    const response = await call();

    assert.equal(response.statusCode, 403);
    assert.deepEqual(body(response), {
      message: ONBOARDING_INCOMPLETE,
      onboardingStep: step,
    });
    assert.deepEqual(onboarding.transitions, []);
    assert.equal(user.givenName, undefined);
  }
});

test("el ROUTE_POLICY declara los pasos PERSONAL_DATA, PLAN y CLINIC y no exige membership", () => {
  assert.deepEqual(declaredPolicy, {
    onboardingStep: ["PERSONAL_DATA", "PLAN", "CLINIC"],
  });
});

test("si otro pedido ya pasó el paso a PLAN, el segundo guarda como corrección y responde PLAN", async () => {
  const { call, user, onboarding, users } = personalDataFlow("PERSONAL_DATA");
  onboarding.beforeWrite = () => {
    const stored = users.users[0];
    if (stored.onboardingStep === "PERSONAL_DATA")
      stored.onboardingStep = "PLAN";
  };

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "PLAN" });
  assert.equal(user.givenName, "Ana");
  assert.deepEqual(onboarding.transitions, [
    { from: ["PERSONAL_DATA"], to: "PLAN" },
    { from: ["PLAN", "CLINIC"] },
  ]);
});

test("si el usuario avanzó a SCHEDULE entre la policy y la escritura, responde 500 con el mensaje de la ruta", async (context) => {
  context.mock.method(console, "error", () => {});
  const { call, onboarding, users } = personalDataFlow("CLINIC");
  onboarding.beforeWrite = () => {
    users.users[0].onboardingStep = "SCHEDULE";
  };

  const response = await call();

  assert.equal(response.statusCode, 500);
  assert.deepEqual(body(response), { message: PERSONAL_DATA_FAILED });
});

test("si falla DynamoDB al escribir o al leer la sesión, responde 500 con el mensaje de la ruta", async (context) => {
  context.mock.method(console, "error", () => {});
  const failingWrite = personalDataFlow();
  failingWrite.onboarding.failOnWrite = true;
  const failingRead = personalDataFlow();
  failingRead.users.failOnRead = true;

  for (const flow of [failingWrite, failingRead]) {
    const response = await flow.call();

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body(response), {
      message: "No pudimos guardar tus datos. Intenta de nuevo.",
    });
  }
});

test("ni los datos personales ni los tokens aparecen en los logs", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  const flow = personalDataFlow();
  const secrets = [
    "Ana",
    "Pérez",
    "987654321",
    "ana@clinica.pe",
    COGNITO_SUB,
    "eyJhbGciOi.token.firma",
  ];
  flow.onboarding.savePersonalData = async () => {
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
