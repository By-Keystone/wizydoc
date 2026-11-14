import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorizeRequestUseCase } from "../../lib/src/users/application/authorize-request.usecase";
import { CreateClinicUseCase } from "../../lib/src/users/application/create-clinic.usecase";
import { givenNameSchema } from "../../lib/src/users/domain/value-objects/person-name.vo";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";
import type { OnboardingStep } from "../../lib/src/users/domain/user.entity";
import { handleCreateClinic } from "../../lib/src/users/handlers/create-clinic.http";
import {
  CLINIC_ALREADY_CREATED,
  CLINIC_FAILED,
  ONBOARDING_INCOMPLETE,
} from "../../lib/src/users/handlers/http-messages";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryClinics,
  InMemoryOnboarding,
  InMemoryUsers,
  privateEvent,
  readDeclaredPolicy,
} from "./fakes";

const declaredPolicy = readDeclaredPolicy("CreateClinicFunction");
const NOW = new Date("2026-11-12T15:00:00.000Z");
const VALID_BODY = {
  name: "Consultorio Ana",
  address: "Av. Arequipa 123, Lima",
  specialty: "Pediatría",
};

const bodyEvent = (body: unknown) =>
  privateEvent({ body: JSON.stringify(body) });

const clinicFlow = (onboardingStep: OnboardingStep = "CLINIC") => {
  const user = buildUser({
    onboardingStep,
    givenName: givenNameSchema.parse("Ana"),
    phone: phoneSchema.parse("987654321"),
  });
  const users = new InMemoryUsers([user]);
  const onboarding = new InMemoryOnboarding(users);
  return {
    user,
    users,
    onboarding,
    call: (event = bodyEvent(VALID_BODY)) =>
      handleCreateClinic(event, {
        authorizeRequest: new AuthorizeRequestUseCase(
          users,
          new InMemoryClinics(),
          declaredPolicy,
        ),
        createClinic: new CreateClinicUseCase(onboarding, () => NOW),
      }),
  };
};

const body = (response: { body: string }) => JSON.parse(response.body);

test("crear «Tu consultorio» crea, en una transacción, la organización, la sede, la membership ADMIN sobre la organización, la membership DOCTOR sobre la sede con la especialidad, y pasa el paso a SCHEDULE", async () => {
  const { call, user, onboarding } = clinicFlow();

  const response = await call();

  const {
    organizations: [organization],
    clinics: [clinic],
    memberships,
  } = onboarding;
  assert.equal(response.statusCode, 201);
  assert.deepEqual(body(response), {
    organizationId: organization.id,
    clinicId: clinic.id,
    onboardingStep: "SCHEDULE",
  });
  assert.equal(organization.name, VALID_BODY.name);
  assert.equal(clinic.name, VALID_BODY.name);
  assert.equal(clinic.address, VALID_BODY.address);
  assert.equal(clinic.organizationId, organization.id);
  assert.deepEqual(
    memberships.map(
      ({ userId, resourceId, resourceType, role, specialties }) => ({
        userId,
        resourceId,
        resourceType,
        role,
        specialties,
      }),
    ),
    [
      {
        userId: user.id,
        resourceId: organization.id,
        resourceType: "ORGANIZATION",
        role: "ADMIN",
        specialties: undefined,
      },
      {
        userId: user.id,
        resourceId: clinic.id,
        resourceType: "CLINIC",
        role: "DOCTOR",
        specialties: ["Pediatría"],
      },
    ],
  );
  assert.equal(user.onboardingStep, "SCHEDULE");
  assert.deepEqual(onboarding.transitions, [
    { from: ["CLINIC"], to: "SCHEDULE" },
  ]);
});

test("crear «Tu consultorio» ignora la organización y la cuenta del cuerpo", async () => {
  const { call, user, onboarding } = clinicFlow();

  await call(
    bodyEvent({
      ...VALID_BODY,
      organizationId: "01M6MSQWFCK15Q3X04AQEQ0AAA",
      accountId: "01M6MSQWFCK15Q3X04AQEQ0BBB",
    }),
  );

  const {
    organizations: [organization],
    clinics: [clinic],
    memberships,
  } = onboarding;
  assert.notEqual(organization.id, "01M6MSQWFCK15Q3X04AQEQ0AAA");
  assert.equal(clinic.organizationId, organization.id);
  assert.deepEqual(
    [organization, clinic, ...memberships].map(({ accountId }) => accountId),
    Array(4).fill(user.accountId),
  );
});

test("los textos se recortan", async () => {
  const { call, onboarding } = clinicFlow();

  await call(
    bodyEvent({
      name: "  Consultorio  ",
      address: " Calle 1 ",
      specialty: " X ",
    }),
  );

  const {
    clinics: [clinic],
    memberships,
  } = onboarding;
  assert.equal(clinic.name, "Consultorio");
  assert.equal(clinic.address, "Calle 1");
  assert.deepEqual(memberships[1].specialties, ["X"]);
});

test("un cuerpo inválido responde 400 con el primer mensaje, sin leer la sesión", async () => {
  const cases: [unknown, string][] = [
    [{ ...VALID_BODY, name: " " }, "Escribe el nombre de tu consultorio."],
    [
      { ...VALID_BODY, name: "a".repeat(101) },
      "El nombre del consultorio no puede tener más de 100 caracteres.",
    ],
    [
      { ...VALID_BODY, address: undefined },
      "Escribe la dirección de tu consultorio.",
    ],
    [
      { ...VALID_BODY, address: "a".repeat(201) },
      "La dirección no puede tener más de 200 caracteres.",
    ],
    [{ ...VALID_BODY, specialty: 1 }, "Escribe tu especialidad."],
    [
      { ...VALID_BODY, specialty: "a".repeat(101) },
      "La especialidad no puede tener más de 100 caracteres.",
    ],
    [[], "La solicitud no es válida."],
  ];
  for (const [requestBody, message] of cases) {
    const flow = clinicFlow();
    flow.users.failOnRead = true;

    const response = await flow.call(bodyEvent(requestBody));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message });
    assert.deepEqual(flow.onboarding.clinics, []);
  }
  const response = await clinicFlow().call(
    privateEvent({ body: "no es json" }),
  );
  assert.deepEqual(body(response), { message: "La solicitud no es válida." });
});

test("de dos pedidos a la vez para crear el consultorio, sólo uno lo crea; el otro responde 409", async () => {
  const { call, user, onboarding } = clinicFlow();
  const arrivals: (() => void)[] = [];
  onboarding.beforeWrite = () =>
    new Promise<void>((resolve) => {
      arrivals.push(resolve);
      if (arrivals.length === 2) for (const release of arrivals) release();
    });

  const responses = await Promise.all([call(), call()]);

  assert.deepEqual(
    responses.map(({ statusCode }) => statusCode).sort(),
    [201, 409],
  );
  const conflict = responses.find(({ statusCode }) => statusCode === 409);
  assert.deepEqual(body(conflict as { body: string }), {
    message: CLINIC_ALREADY_CREATED,
  });
  assert.equal(onboarding.organizations.length, 1);
  assert.equal(onboarding.clinics.length, 1);
  assert.equal(onboarding.memberships.length, 2);
  assert.equal(user.onboardingStep, "SCHEDULE");
});

test("cada ruta usada fuera de su paso responde 403 con el paso en que va el usuario", async () => {
  for (const step of [
    "PERSONAL_DATA",
    "PLAN",
    "SCHEDULE",
    "COMPLETED",
  ] as const) {
    const { call, onboarding } = clinicFlow(step);

    const response = await call();

    assert.equal(response.statusCode, 403);
    assert.deepEqual(body(response), {
      message: ONBOARDING_INCOMPLETE,
      onboardingStep: step,
    });
    assert.deepEqual(onboarding.clinics, []);
  }
});

test("el ROUTE_POLICY declara sólo el paso CLINIC y no exige membership", () => {
  assert.deepEqual(declaredPolicy, { onboardingStep: ["CLINIC"] });
});

test("si falla DynamoDB al escribir o al leer la sesión, responde 500 con el mensaje de la ruta", async (context) => {
  context.mock.method(console, "error", () => {});
  const failingWrite = clinicFlow();
  failingWrite.onboarding.failOnWrite = true;
  const failingRead = clinicFlow();
  failingRead.users.failOnRead = true;

  for (const flow of [failingWrite, failingRead]) {
    const response = await flow.call();

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body(response), { message: CLINIC_FAILED });
  }
});

test("ni los datos personales ni los tokens aparecen en los logs", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  const flow = clinicFlow();
  const secrets = [
    VALID_BODY.name,
    VALID_BODY.address,
    VALID_BODY.specialty,
    "Ana",
    "987654321",
    "ana@clinica.pe",
    COGNITO_SUB,
    "eyJhbGciOi.token.firma",
  ];
  flow.onboarding.createClinic = async () => {
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
