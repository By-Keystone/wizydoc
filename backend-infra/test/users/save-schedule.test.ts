import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorizeRequestUseCase } from "../../lib/src/users/application/authorize-request.usecase";
import { SaveScheduleUseCase } from "../../lib/src/users/application/save-schedule.usecase";
import type { Membership } from "../../lib/src/users/domain/membership.entity";
import type { OnboardingStep } from "../../lib/src/users/domain/user.entity";
import {
  ONBOARDING_ALREADY_COMPLETED,
  ONBOARDING_INCOMPLETE,
  SCHEDULE_FAILED,
} from "../../lib/src/users/handlers/http-messages";
import { handleSaveSchedule } from "../../lib/src/users/handlers/save-schedule.http";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryClinics,
  InMemoryOnboarding,
  InMemoryUsers,
  privateEvent,
  readDeclaredPolicy,
} from "./fakes";

const declaredPolicy = readDeclaredPolicy("SaveScheduleFunction");
const NOW = new Date("2026-11-12T15:00:00.000Z");
const CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0C1A";
const OTHER_ACCOUNT_CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0C2B";
const ORGANIZATION_ID = "01M6MSQWFCK15Q3X04AQEQ0D3C";
const ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0S9R";
const OTHER_ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0E4D";

const MONDAY_MORNING = {
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "13:00",
};
const VALID_BODY = { weeklySchedule: [MONDAY_MORNING] };

const ownerMemberships: Membership[] = [
  {
    resourceId: ORGANIZATION_ID,
    resourceType: "ORGANIZATION",
    accountId: ACCOUNT_ID,
    role: "ADMIN",
  },
  {
    resourceId: CLINIC_ID,
    resourceType: "CLINIC",
    accountId: ACCOUNT_ID,
    role: "DOCTOR",
  },
];

const bodyEvent = (body: unknown) =>
  privateEvent({ body: JSON.stringify(body) });

const scheduleFlow = (
  onboardingStep: OnboardingStep = "SCHEDULE",
  memberships: Membership[] = ownerMemberships,
) => {
  const user = buildUser({ onboardingStep });
  const users = new InMemoryUsers([user]);
  users.memberships.set(user.id, memberships);
  const onboarding = new InMemoryOnboarding(users);
  return {
    user,
    users,
    onboarding,
    call: (event = bodyEvent(VALID_BODY)) =>
      handleSaveSchedule(event, {
        authorizeRequest: new AuthorizeRequestUseCase(
          users,
          new InMemoryClinics(),
          declaredPolicy,
        ),
        saveSchedule: new SaveScheduleUseCase(onboarding, () => NOW),
      }),
  };
};

const body = (response: { body: string }) => JSON.parse(response.body);

test("guardar Tu horario crea el horario del usuario en su sede y pasa el paso a COMPLETED, con OnboardingCompletedAt", async () => {
  const { call, user, onboarding } = scheduleFlow();

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "COMPLETED" });
  assert.deepEqual(onboarding.schedules, [
    {
      userId: user.id,
      clinicId: CLINIC_ID,
      accountId: user.accountId,
      weeklySchedule: [MONDAY_MORNING],
      updatedAt: NOW,
    },
  ]);
  assert.equal(user.onboardingStep, "COMPLETED");
  assert.equal(onboarding.completedAt.get(user.id), NOW);
  assert.deepEqual(onboarding.transitions, [
    { from: ["SCHEDULE"], to: "COMPLETED" },
  ]);
});

test("omitir Tu horario pasa el paso a COMPLETED, con OnboardingCompletedAt, sin crear horario", async () => {
  const { call, user, onboarding } = scheduleFlow("SCHEDULE", []);

  const response = await call(bodyEvent({ skip: true }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { onboardingStep: "COMPLETED" });
  assert.deepEqual(onboarding.schedules, []);
  assert.equal(user.onboardingStep, "COMPLETED");
  assert.equal(onboarding.completedAt.get(user.id), NOW);
});

test("skip: true ignora un weeklySchedule inválido", async () => {
  const { call, onboarding } = scheduleFlow();

  const response = await call(
    bodyEvent({ skip: true, weeklySchedule: "no es una lista" }),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(onboarding.schedules, []);
});

test("un skip que no es booleano responde 400", async () => {
  for (const skip of ["true", 1, null]) {
    const { call, onboarding } = scheduleFlow();

    const response = await call(bodyEvent({ skip, ...VALID_BODY }));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message: "La solicitud no es válida." });
    assert.deepEqual(onboarding.transitions, []);
  }
});

test("un horario con bloques que se solapan o con el inicio después del fin responde 400 y no termina el onboarding", async () => {
  const cases: [unknown, string][] = [
    [
      [
        MONDAY_MORNING,
        { ...MONDAY_MORNING, startTime: "12:00", endTime: "14:00" },
      ],
      "Los rangos del lunes no pueden solaparse",
    ],
    [
      [{ ...MONDAY_MORNING, startTime: "13:00", endTime: "09:00" }],
      "La hora de inicio debe ser anterior a la hora de fin",
    ],
    [undefined, "La disponibilidad debe ser una lista de rangos"],
    [[], "La solicitud no es válida."],
  ];
  for (const [weeklySchedule, message] of cases) {
    const flow = scheduleFlow();
    flow.users.failOnRead = true;

    const response = await flow.call(bodyEvent({ weeklySchedule }));

    assert.equal(response.statusCode, 400);
    assert.deepEqual(body(response), { message });
    assert.deepEqual(flow.onboarding.schedules, []);
    assert.equal(flow.user.onboardingStep, "SCHEDULE");
  }
});

test("la sede sale de la membership propia y no de la de otra cuenta", async () => {
  const { call, onboarding } = scheduleFlow("SCHEDULE", [
    {
      resourceId: OTHER_ACCOUNT_CLINIC_ID,
      resourceType: "CLINIC",
      accountId: OTHER_ACCOUNT_ID,
      role: "DOCTOR",
    },
    ...ownerMemberships,
  ]);

  const response = await call(
    bodyEvent({ ...VALID_BODY, clinicId: OTHER_ACCOUNT_CLINIC_ID }),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(onboarding.schedules[0].clinicId, CLINIC_ID);
});

test("sin una membership DOCTOR en una sede propia, responde 500", async (context) => {
  context.mock.method(console, "error", () => {});
  const withoutClinic = scheduleFlow("SCHEDULE", [ownerMemberships[0]]);
  const otherAccountOnly = scheduleFlow("SCHEDULE", [
    { ...ownerMemberships[1], accountId: OTHER_ACCOUNT_ID },
  ]);
  const twoClinics = scheduleFlow("SCHEDULE", [
    ...ownerMemberships,
    { ...ownerMemberships[1], resourceId: OTHER_ACCOUNT_CLINIC_ID },
  ]);

  for (const flow of [withoutClinic, otherAccountOnly, twoClinics]) {
    const response = await flow.call();

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body(response), { message: SCHEDULE_FAILED });
    assert.deepEqual(flow.onboarding.schedules, []);
    assert.equal(flow.user.onboardingStep, "SCHEDULE");
  }
});

test("si el paso ya no es SCHEDULE al escribir, responde 409", async () => {
  const { call, users, onboarding } = scheduleFlow();
  onboarding.beforeWrite = () => {
    users.users[0].onboardingStep = "COMPLETED";
  };

  const response = await call();

  assert.equal(response.statusCode, 409);
  assert.deepEqual(body(response), { message: ONBOARDING_ALREADY_COMPLETED });
  assert.deepEqual(onboarding.schedules, []);
});

test("cada ruta usada fuera de su paso responde 403 con el paso en que va el usuario", async () => {
  for (const step of [
    "PERSONAL_DATA",
    "PLAN",
    "CLINIC",
    "COMPLETED",
  ] as const) {
    const { call, onboarding } = scheduleFlow(step);

    const response = await call();

    assert.equal(response.statusCode, 403);
    assert.deepEqual(body(response), {
      message: ONBOARDING_INCOMPLETE,
      onboardingStep: step,
    });
    assert.deepEqual(onboarding.schedules, []);
  }
});

test("el ROUTE_POLICY declara sólo el paso SCHEDULE y no exige membership", () => {
  assert.deepEqual(declaredPolicy, { onboardingStep: ["SCHEDULE"] });
});

test("si falla DynamoDB al escribir o al leer la sesión, responde 500 con el mensaje de la ruta", async (context) => {
  context.mock.method(console, "error", () => {});
  const failingWrite = scheduleFlow();
  failingWrite.onboarding.failOnWrite = true;
  const failingRead = scheduleFlow();
  failingRead.users.failOnRead = true;

  for (const flow of [failingWrite, failingRead]) {
    const response = await flow.call();

    assert.equal(response.statusCode, 500);
    assert.deepEqual(body(response), { message: SCHEDULE_FAILED });
  }
});

test("ni los datos personales ni los tokens aparecen en los logs", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  const flow = scheduleFlow();
  const secrets = ["09:00", "ana@clinica.pe", "+51987654321", COGNITO_SUB];
  flow.onboarding.completeOnboarding = async () => {
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
