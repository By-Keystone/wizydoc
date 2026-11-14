import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { BackendStack } from "../../lib/backend-stack";
import {
  AuthorizeRequestUseCase,
  type RoutePolicy,
} from "../../lib/src/users/application/authorize-request.usecase";
import { GetMeUseCase } from "../../lib/src/users/application/get-me.usecase";
import {
  familyNameSchema,
  givenNameSchema,
} from "../../lib/src/users/domain/value-objects/person-name.vo";
import { phoneSchema } from "../../lib/src/users/domain/value-objects/phone.vo";
import { treatmentSchema } from "../../lib/src/users/domain/value-objects/treatment.vo";
import { handleMe } from "../../lib/src/users/handlers/me.http";
import {
  buildUser,
  COGNITO_SUB,
  InMemoryAccounts,
  InMemoryClinics,
  InMemoryUsers,
  privateEvent,
} from "./fakes";

const OWNER_USER_ID = "01M6MSQWFCK15Q3X04AQEQ0SFY";

const readDeclaredPolicy = (): RoutePolicy => {
  const stack = new BackendStack(
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
    "MePolicyTest",
    {
      env: { account: "111111111111", region: "us-east-2" },
      hostedZoneId: "Z0000000000000000000",
      zoneName: "wizydoc.app",
      apiDomainName: "api.wizydoc.app",
      frontendUrl: "https://app.wizydoc.app",
      emailFrom: "WizyDoc <no-reply@wizydoc.app>",
      termsAcceptanceRequired: false,
    },
  );
  const [meFunction] = Object.entries(
    Template.fromStack(stack).findResources("AWS::Lambda::Function"),
  )
    .filter(([logicalId]) => logicalId.startsWith("MeFunction"))
    .map(([, resource]) => resource);
  return JSON.parse(meFunction.Properties.Environment.Variables.ROUTE_POLICY);
};

const declaredPolicy = readDeclaredPolicy();

const meFlow = ({
  user = buildUser({ onboardingStep: "PERSONAL_DATA" }),
  ownerUserId = user.id,
  hasAccount = true,
}: {
  user?: ReturnType<typeof buildUser>;
  ownerUserId?: string;
  hasAccount?: boolean;
} = {}) => {
  const users = new InMemoryUsers([user]);
  const accounts = new InMemoryAccounts();
  if (hasAccount) accounts.accounts.push({ id: user.accountId, ownerUserId });
  return {
    users,
    call: (event = privateEvent()) =>
      handleMe(event, {
        authorizeRequest: new AuthorizeRequestUseCase(
          users,
          new InMemoryClinics(),
          declaredPolicy,
        ),
        getMe: new GetMeUseCase(accounts),
      }),
  };
};

test("GET /api/me con un ID token válido responde 200 con los datos del usuario, su cuenta, si es el dueño y su paso del onboarding, aunque no lo haya terminado", async () => {
  const user = buildUser({ onboardingStep: "PERSONAL_DATA" });

  const response = await meFlow({ user }).call();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    id: user.id,
    email: "ana@clinica.pe",
    givenName: null,
    familyName: null,
    phone: null,
    treatment: null,
    accountId: user.accountId,
    isAccountOwner: true,
    onboardingStep: "PERSONAL_DATA",
  });
});

test("GET /api/me responde el nombre, el apellido, el celular y el tratamiento guardados", async () => {
  const user = buildUser({
    givenName: givenNameSchema.parse("Ana"),
    familyName: familyNameSchema.parse("Pérez"),
    phone: phoneSchema.parse("987654321"),
    treatment: treatmentSchema.parse("DRA"),
  });

  const response = await meFlow({ user }).call();

  const body = JSON.parse(response.body);
  assert.equal(body.givenName, "Ana");
  assert.equal(body.familyName, "Pérez");
  assert.equal(body.phone, "+51987654321");
  assert.equal(body.treatment, "DRA");
});

test("el ROUTE_POLICY de MeFunction es confirmed false y cualquier paso del onboarding", () => {
  assert.deepEqual(declaredPolicy, {
    confirmed: false,
    onboardingStep: "ANY",
  });
});

test("un usuario que no es dueño de su cuenta recibe isAccountOwner false", async () => {
  const response = await meFlow({ ownerUserId: OWNER_USER_ID }).call();

  assert.equal(JSON.parse(response.body).isAccountOwner, false);
});

test("un ID token válido cuyo sub no tiene usuario responde 401", async () => {
  const response = await meFlow().call(
    privateEvent({ sub: "4b1c7a2e-0000-4000-8000-0000000000ff" }),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    message: "Tu sesión venció. Inicia sesión de nuevo.",
  });
});

test("sin cuenta, /api/me responde 500", async (context) => {
  context.mock.method(console, "error", () => {});

  const response = await meFlow({ hasAccount: false }).call();

  assert.equal(response.statusCode, 500);
});

test("ni los tokens ni los datos personales aparecen en los logs", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  const flow = meFlow();
  const secrets = [
    "ana@clinica.pe",
    "Pérez",
    "+51987654321",
    COGNITO_SUB,
    "eyJhbGciOi.token.firma",
  ];
  flow.users.findByCognitoSubWithMemberships = async () => {
    throw new Error(`falló con ${secrets.join(" ")}`);
  };

  const response = await flow.call();

  const logged = JSON.stringify(
    errors.mock.calls.map((call) => call.arguments),
  );
  assert.equal(response.statusCode, 500);
  for (const secret of secrets) {
    assert.equal(logged.includes(secret), false);
    assert.equal(response.body.includes(secret), false);
  }
});
