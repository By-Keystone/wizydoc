import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANY_ONBOARDING_STEP,
  AuthorizeRequestUseCase,
  ROUTE_POLICY_VARIABLE,
  type RoutePolicy,
} from "../../lib/src/users/application/authorize-request.usecase";
import type { Membership } from "../../lib/src/users/domain/membership.entity";
import {
  EMAIL_NOT_CONFIRMED,
  ONBOARDING_INCOMPLETE,
  RESOURCE_NOT_FOUND,
  ROLE_FORBIDDEN,
  SESSION_EXPIRED,
} from "../../lib/src/users/handlers/http-messages";
import {
  handlePrivateRoute,
  readRoutePolicy,
} from "../../lib/src/users/handlers/private-route";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryClinics,
  InMemoryUsers,
  privateEvent,
} from "./fakes";

const CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0SAS";
const OTHER_CLINIC_ID = "01M6MSQWFCK15Q3X04AQEQ0SBT";
const ORGANIZATION_ID = "01M6MSQWFCK15Q3X04AQEQ0SCV";
const OTHER_ORGANIZATION_ID = "01M6MSQWFCK15Q3X04AQEQ0SDW";
const OTHER_ACCOUNT_ID = "01M6MSQWFCK15Q3X04AQEQ0SEX";
const OTHER_USER_ID = "01M6MSQWFCK15Q3X04AQEQ0SFY";

const clinicMembership = (overrides: Partial<Membership> = {}): Membership => ({
  resourceId: CLINIC_ID,
  resourceType: "CLINIC",
  accountId: buildUser().accountId,
  role: "DOCTOR",
  ...overrides,
});

const organizationMembership = (
  overrides: Partial<Membership> = {},
): Membership =>
  clinicMembership({
    resourceId: ORGANIZATION_ID,
    resourceType: "ORGANIZATION",
    role: "ADMIN",
    ...overrides,
  });

const clinicRoute: RoutePolicy = { member: true, resourceType: "CLINIC" };

const route = ({
  policy = {},
  user = buildUser(),
  memberships = [],
}: {
  policy?: RoutePolicy;
  user?: ReturnType<typeof buildUser>;
  memberships?: Membership[];
} = {}) => {
  const users = new InMemoryUsers([user]);
  users.memberships.set(user.id, memberships);
  const clinics = new InMemoryClinics();
  clinics.organizationIds.set(CLINIC_ID, ORGANIZATION_ID);
  const authorizeRequest = new AuthorizeRequestUseCase(users, clinics, policy);
  const authorized: unknown[] = [];

  const call = (event = privateEvent({ resourceId: CLINIC_ID })) =>
    handlePrivateRoute(event, authorizeRequest, async (request) => {
      authorized.push(request);
      return { statusCode: 200, body: "{}" };
    });

  return { users, clinics, authorized, call };
};

const message = (response: { body: string }) => JSON.parse(response.body);

test("un ID token válido cuyo sub no tiene usuario responde 401", async () => {
  const { call, authorized } = route();

  const response = await call(privateEvent({ sub: "otro-sub" }));

  assert.equal(response.statusCode, 401);
  assert.deepEqual(message(response), { message: SESSION_EXPIRED });
  assert.deepEqual(authorized, []);
});

test("la Lambda toma el sub sólo de los claims del autorizador", async () => {
  const { call, users } = route();
  const otherUser = buildUser({ id: OTHER_USER_ID, cognitoSub: "otro-sub" });
  users.users.push(otherUser);
  const spoofed = privateEvent({
    body: JSON.stringify({ sub: "otro-sub", cognitoSub: "otro-sub" }),
    headers: { "x-sub": "otro-sub", authorization: "otro-sub" },
    pathParameters: { sub: "otro-sub", resourceId: CLINIC_ID },
  });

  await call(spoofed);

  const noClaims = [
    privateEvent({ requestContext: {} }),
    privateEvent({ requestContext: { authorizer: null } }),
    privateEvent({ requestContext: { authorizer: { claims: {} } } }),
    privateEvent({ sub: "" }),
    privateEvent({ sub: 42 }),
  ];
  for (const event of noClaims) {
    const response = await call({ ...event, body: spoofed.body });
    assert.equal(response.statusCode, 401);
  }
});

test("por defecto la ruta exige el correo confirmado y responde 403 si no lo está", async () => {
  const { call, authorized } = route({
    user: buildUser({ confirmed: false }),
  });

  const response = await call();

  assert.equal(response.statusCode, 403);
  assert.deepEqual(message(response), { message: EMAIL_NOT_CONFIRMED });
  assert.deepEqual(authorized, []);
});

test("una ruta que declara confirmed: false deja pasar al usuario sin confirmar", async () => {
  const { call } = route({
    policy: { confirmed: false },
    user: buildUser({ confirmed: false }),
  });

  assert.equal((await call()).statusCode, 200);
});

test("una ruta que exige el onboarding terminado responde 403 con el paso en que va el usuario si no lo terminó", async () => {
  const { call, authorized } = route({
    user: buildUser({ onboardingStep: "CLINIC" }),
  });

  const response = await call();

  assert.equal(response.statusCode, 403);
  assert.deepEqual(message(response), {
    message: ONBOARDING_INCOMPLETE,
    onboardingStep: "CLINIC",
  });
  assert.deepEqual(authorized, []);
});

test("ANY deja pasar cualquier paso y un paso o una lista de pasos sólo esos", async () => {
  const atPlan = buildUser({ onboardingStep: "PLAN" });

  const any = route({
    policy: { onboardingStep: ANY_ONBOARDING_STEP },
    user: atPlan,
  });
  const exact = route({ policy: { onboardingStep: "PLAN" }, user: atPlan });
  const other = route({ policy: { onboardingStep: "CLINIC" }, user: atPlan });
  const list = route({
    policy: { onboardingStep: ["PLAN", "CLINIC"] },
    user: atPlan,
  });
  const outsideList = route({
    policy: { onboardingStep: ["CLINIC", "SCHEDULE"] },
    user: atPlan,
  });

  assert.equal((await any.call()).statusCode, 200);
  assert.equal((await exact.call()).statusCode, 200);
  assert.equal((await other.call()).statusCode, 403);
  assert.equal((await list.call()).statusCode, 200);
  assert.equal((await outsideList.call()).statusCode, 403);
});

test("con todo en contra responde el primer paso que falla, en el orden de la spec", async () => {
  const policy: RoutePolicy = { ...clinicRoute, roles: ["ADMIN"] };
  const user = buildUser({ confirmed: false, onboardingStep: "PLAN" });

  const unconfirmed = route({ policy, user });
  const wrongStep = route({
    policy,
    user: buildUser({ onboardingStep: "PLAN" }),
  });
  const noMembership = route({ policy });
  const wrongRole = route({ policy, memberships: [clinicMembership()] });

  assert.equal((await unconfirmed.call()).statusCode, 403);
  assert.equal(message(await unconfirmed.call()).message, EMAIL_NOT_CONFIRMED);
  assert.equal(message(await wrongStep.call()).message, ONBOARDING_INCOMPLETE);
  assert.equal(message(await noMembership.call()).message, RESOURCE_NOT_FOUND);
  assert.equal(message(await wrongRole.call()).message, ROLE_FORBIDDEN);
});

test("una ruta que exige ser miembro de un recurso responde 404 si el usuario no tiene membership sobre él, también si el recurso existe en otra cuenta", async () => {
  const { call, users, authorized } = route({
    policy: clinicRoute,
    memberships: [clinicMembership({ resourceId: OTHER_CLINIC_ID })],
  });
  users.users.push(buildUser({ id: OTHER_USER_ID, cognitoSub: "otro-sub" }));
  users.memberships.set(OTHER_USER_ID, [
    clinicMembership({ accountId: OTHER_ACCOUNT_ID }),
  ]);

  const response = await call();

  assert.equal(response.statusCode, 404);
  assert.deepEqual(message(response), { message: RESOURCE_NOT_FOUND });
  assert.deepEqual(authorized, []);
});

test("una ruta que exige ser miembro entrega la membership a la ruta", async () => {
  const membership = clinicMembership();
  const { call, authorized } = route({
    policy: clinicRoute,
    memberships: [membership],
  });

  assert.equal((await call()).statusCode, 200);
  assert.deepEqual(authorized, [
    { kind: "authorized", user: buildUser(), membership },
  ]);
});

test("una ruta que exige ciertos roles responde 403 si la membership tiene otro", async () => {
  const { call, authorized } = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN"] },
    memberships: [clinicMembership({ role: "USER" })],
  });

  const response = await call();

  assert.equal(response.statusCode, 403);
  assert.deepEqual(message(response), { message: ROLE_FORBIDDEN });
  assert.deepEqual(authorized, []);
});

test("una ruta que exige ciertos roles responde 404 si el usuario no es miembro", async () => {
  const { call } = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN"] },
  });

  assert.equal((await call()).statusCode, 404);
});

test("una ruta que exige ciertos roles deja pasar a quien tiene uno de ellos", async () => {
  const { call } = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN", "DOCTOR"] },
    memberships: [clinicMembership({ role: "DOCTOR" })],
  });

  assert.equal((await call()).statusCode, 200);
});

test("una membership de organización con el mismo id no autoriza una ruta de sede", async () => {
  const { call, clinics } = route({
    policy: clinicRoute,
    memberships: [organizationMembership({ resourceId: CLINIC_ID })],
  });
  clinics.organizationIds.clear();

  assert.equal((await call()).statusCode, 404);
});

test("una membership de sede con el mismo id no autoriza una ruta de organización", async () => {
  const { call, clinics } = route({
    policy: { member: true, resourceType: "ORGANIZATION" },
    memberships: [clinicMembership({ resourceId: ORGANIZATION_ID })],
  });

  const response = await call(privateEvent({ resourceId: ORGANIZATION_ID }));

  assert.equal(response.statusCode, 404);
  assert.equal(clinics.reads, 0);
});

test("el rol en la organización se hereda en sus sedes", async () => {
  const { call, authorized, clinics } = route({
    policy: clinicRoute,
    memberships: [organizationMembership({ role: "ADMIN" })],
  });

  const response = await call();

  assert.equal(response.statusCode, 200);
  assert.equal(clinics.reads, 1);
  assert.deepEqual(authorized, [
    {
      kind: "authorized",
      user: buildUser(),
      membership: clinicMembership({ role: "ADMIN" }),
    },
  ]);
});

test("gana el rol más alto entre el directo en la sede y el heredado de la organización", async () => {
  const directAdmin = route({
    policy: { resourceType: "CLINIC", roles: ["DOCTOR"] },
    memberships: [
      clinicMembership({ role: "ADMIN" }),
      organizationMembership({ role: "DOCTOR" }),
    ],
  });
  const inheritedAdmin = route({
    policy: { resourceType: "CLINIC", roles: ["DOCTOR"] },
    memberships: [
      clinicMembership({ role: "DOCTOR" }),
      organizationMembership({ role: "ADMIN" }),
    ],
  });
  const tie = route({
    policy: clinicRoute,
    memberships: [
      clinicMembership({ role: "DOCTOR" }),
      organizationMembership({ role: "DOCTOR" }),
    ],
  });

  assert.equal((await directAdmin.call()).statusCode, 403);
  assert.equal((await inheritedAdmin.call()).statusCode, 403);
  assert.equal((await tie.call()).statusCode, 200);
});

test("si el rol directo en la sede no alcanza, se usa el de la organización", async () => {
  const { call, authorized } = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN"] },
    memberships: [
      clinicMembership({ role: "USER" }),
      organizationMembership({ role: "ADMIN" }),
    ],
  });

  assert.equal((await call()).statusCode, 200);
  assert.deepEqual(authorized, [
    {
      kind: "authorized",
      user: buildUser(),
      membership: clinicMembership({ role: "ADMIN" }),
    },
  ]);
});

test("si ni el rol directo ni el heredado alcanzan, responde 403", async () => {
  const withDirect = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN"] },
    memberships: [
      clinicMembership({ role: "USER" }),
      organizationMembership({ role: "DOCTOR" }),
    ],
  });
  const onlyInherited = route({
    policy: { resourceType: "CLINIC", roles: ["ADMIN"] },
    memberships: [organizationMembership({ role: "USER" })],
  });

  assert.equal((await withDirect.call()).statusCode, 403);
  assert.equal((await onlyInherited.call()).statusCode, 403);
});

test("la sede de otra organización o que no existe no hereda y responde 404", async () => {
  const otherOrganization = route({
    policy: clinicRoute,
    memberships: [
      organizationMembership({ resourceId: OTHER_ORGANIZATION_ID }),
    ],
  });
  const missingClinic = route({
    policy: clinicRoute,
    memberships: [organizationMembership()],
  });
  missingClinic.clinics.organizationIds.clear();

  assert.equal((await otherOrganization.call()).statusCode, 404);
  assert.equal((await missingClinic.call()).statusCode, 404);
});

test("sin ninguna membership de organización no se lee la sede", async () => {
  const { call, clinics } = route({ policy: clinicRoute });

  assert.equal((await call()).statusCode, 404);
  assert.equal(clinics.reads, 0);
});

test("una policy que exige membership sin resourceId responde 500 sin leer DynamoDB", async () => {
  const { call, users } = route({ policy: clinicRoute });
  let reads = 0;
  users.findByCognitoSubWithMemberships = async () => {
    reads += 1;
    return undefined;
  };
  const errors = captureErrors();

  const response = await call(privateEvent());
  errors.restore();

  assert.equal(response.statusCode, 500);
  assert.equal(reads, 0);
});

test("si falla la lectura de DynamoDB o la ruta, responde 500 sin valores", async () => {
  const failingRead = route();
  failingRead.users.failOnRead = true;
  const failingRoute = route();
  const errors = captureErrors();

  const readResponse = await failingRead.call();
  const routeResponse = await handlePrivateRoute(
    privateEvent(),
    new AuthorizeRequestUseCase(failingRoute.users, failingRoute.clinics, {}),
    async () => {
      throw new Error("falló la ruta");
    },
  );
  errors.restore();

  assert.equal(readResponse.statusCode, 500);
  assert.equal(routeResponse.statusCode, 500);
  assert.deepEqual(message(routeResponse), {
    message: "No pudimos completar la solicitud. Intenta de nuevo.",
  });
});

test("ni los tokens ni los datos personales aparecen en los logs", async () => {
  const { call, users } = route();
  const secrets = ["ana@clinica.pe", COGNITO_SUB, "eyJhbGciOi.token.firma"];
  users.findByCognitoSubWithMemberships = async () => {
    throw new Error(`falló con ${secrets.join(" ")}`);
  };
  const errors = captureErrors();

  const response = await call();
  errors.restore();

  const logged = JSON.stringify(errors.calls);
  assert.equal(response.statusCode, 500);
  assert.equal(errors.calls.length, 1);
  for (const secret of secrets) {
    assert.equal(logged.includes(secret), false);
    assert.equal(response.body.includes(secret), false);
  }
});

test("readRoutePolicy lee la variable y rechaza una ausente, un campo desconocido, un paso que no existe y roles vacío", () => {
  const original = process.env[ROUTE_POLICY_VARIABLE];
  const read = (value: string | undefined) => {
    if (value === undefined) delete process.env[ROUTE_POLICY_VARIABLE];
    else process.env[ROUTE_POLICY_VARIABLE] = value;
    return () => readRoutePolicy();
  };

  try {
    assert.deepEqual(read('{"confirmed":false,"onboardingStep":"ANY"}')(), {
      confirmed: false,
      onboardingStep: "ANY",
      member: false,
    });
    assert.throws(read(undefined));
    assert.throws(read('{"admin":true}'));
    assert.throws(read('{"onboardingStep":"DONE"}'));
    assert.throws(read('{"resourceType":"CLINIC","roles":[]}'));
    assert.throws(read('{"member":true}'));
    assert.throws(read('{"resourceType":"CLINIC"}'));
  } finally {
    if (original === undefined) delete process.env[ROUTE_POLICY_VARIABLE];
    else process.env[ROUTE_POLICY_VARIABLE] = original;
  }
});

function captureErrors() {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.error = original;
    },
  };
}
