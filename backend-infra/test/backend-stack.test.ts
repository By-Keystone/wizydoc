import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { routePolicySchema } from "../lib/src/users/application/authorize-request.usecase";
import { BackendStack, type BackendStackProps } from "../lib/backend-stack";

const SKIP_BUNDLING = { "aws:cdk:bundling-stacks": [] };

function synthesizeBackend(overrides: Partial<BackendStackProps> = {}) {
  const stack = new BackendStack(
    new App({ context: SKIP_BUNDLING }),
    "BackendTest",
    {
      env: { account: "111111111111", region: "us-east-2" },
      hostedZoneId: "Z0000000000000000000",
      zoneName: "wizydoc.app",
      apiDomainName: "api.wizydoc.app",
      frontendUrl: "https://app.wizydoc.app",
      emailFrom: "WizyDoc <no-reply@wizydoc.app>",
      termsAcceptanceRequired: false,
      ...overrides,
    },
  );

  return Template.fromStack(stack);
}

const functionLogicalId = (template: Template, functionName: string) => {
  const logicalId = Object.keys(
    template.findResources("AWS::Lambda::Function"),
  ).find((id) => id.startsWith(functionName));
  assert.ok(logicalId, `no se encontró la Lambda ${functionName}`);
  return logicalId;
};

const functionProperties = (template: Template, functionName: string) =>
  template.findResources("AWS::Lambda::Function")[
    functionLogicalId(template, functionName)
  ].Properties;

const policyFor = (template: Template, functionName: string) => {
  const role = functionProperties(template, functionName).Role["Fn::GetAtt"][0];
  const [policy] = Object.values(
    template.findResources("AWS::IAM::Policy"),
  ).filter((candidate) =>
    JSON.stringify(candidate.Properties.Roles).includes(role),
  );
  assert.ok(policy, `no se encontró la política de ${functionName}`);
  return JSON.stringify(policy.Properties.PolicyDocument);
};

const resourcePath = (template: Template, logicalId: string): string => {
  const { PathPart, ParentId } = template.findResources(
    "AWS::ApiGateway::Resource",
  )[logicalId].Properties;
  return ParentId.Ref
    ? `${resourcePath(template, ParentId.Ref)}/${PathPart}`
    : `/${PathPart}`;
};

const routePaths = (template: Template) =>
  Object.values(
    template.findResources("AWS::ApiGateway::Method", {
      Properties: { HttpMethod: "POST" },
    }),
  )
    .map(({ Properties }) => resourcePath(template, Properties.ResourceId.Ref))
    .sort();

test("las tres rutas de la sesión son POST y exigen la clave de platform", () => {
  const template = synthesizeBackend();

  const postMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method", {
      Properties: { HttpMethod: "POST" },
    }),
  );

  assert.deepEqual(routePaths(template), [
    "/api/auth/sign-in",
    "/api/auth/sign-out",
    "/api/auth/sign-up/code",
    "/api/auth/sign-up/code/verify",
    "/api/auth/sign-up/confirm",
    "/api/auth/token/refresh",
  ]);
  const lambdaByPath: Record<string, string> = {
    "/api/auth/sign-in": "SignInFunction",
    "/api/auth/sign-out": "SignOutFunction",
    "/api/auth/sign-up/code": "RequestSignUpCodeFunction",
    "/api/auth/sign-up/code/verify": "VerifySignUpCodeFunction",
    "/api/auth/sign-up/confirm": "ConfirmSignUpFunction",
    "/api/auth/token/refresh": "RefreshSessionFunction",
  };
  for (const { Properties } of postMethods) {
    const functionName =
      lambdaByPath[resourcePath(template, Properties.ResourceId.Ref)];
    assert.ok(
      JSON.stringify(Properties.Integration.Uri).includes(
        functionLogicalId(template, functionName),
      ),
      functionName,
    );
  }
  for (const method of postMethods) {
    assert.equal(method.Properties.ApiKeyRequired, true);
  }
});

test("GET /health y GET /api/me son las únicas rutas GET, exigen la clave de platform y no hay ruta comodín", () => {
  const template = synthesizeBackend();

  const getMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method", {
      Properties: { HttpMethod: "GET" },
    }),
  );
  const pathParts = Object.values(
    template.findResources("AWS::ApiGateway::Resource"),
  ).map((resource) => resource.Properties.PathPart);
  const httpMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  ).map((method) => method.Properties.HttpMethod);

  assert.deepEqual(
    getMethods
      .map(({ Properties }) =>
        resourcePath(template, Properties.ResourceId.Ref),
      )
      .sort(),
    ["/api/me", "/health"],
  );
  for (const method of getMethods) {
    assert.equal(method.Properties.ApiKeyRequired, true);
  }
  assert.ok(pathParts.includes("health"));
  assert.equal(pathParts.includes("{proxy+}"), false);
  assert.equal(httpMethods.includes("ANY"), false);
});

const accessByAction = (template: Template, functionName: string) => {
  const statements: {
    Action: string | string[];
    Condition?: Record<string, Record<string, string[]>>;
  }[] = JSON.parse(policyFor(template, functionName)).Statement;
  return Object.fromEntries(
    statements
      .filter(({ Condition }) => Condition?.["ForAllValues:StringLike"])
      .map(({ Action, Condition }) => [
        Action,
        Condition?.["ForAllValues:StringLike"]["dynamodb:LeadingKeys"],
      ]),
  );
};

test("cada Lambda sólo tiene los permisos que usa", () => {
  const template = synthesizeBackend();

  assert.deepEqual(accessByAction(template, "RequestSignUpCodeFunction"), {
    "dynamodb:PutItem": ["SIGN_UP_CODE#*", "SIGN_UP_NOTICE#*"],
    "dynamodb:UpdateItem": ["EMAIL_SEND_ATTEMPTS#*"],
  });
  assert.deepEqual(accessByAction(template, "ConfirmSignUpFunction"), {
    "dynamodb:GetItem": ["SIGN_UP_VERIFICATION#*"],
    "dynamodb:PutItem": ["USER#*", "ACCOUNT#*"],
    "dynamodb:DeleteItem": ["SIGN_UP_VERIFICATION#*"],
  });
  assert.deepEqual(accessByAction(template, "VerifySignUpCodeFunction"), {
    "dynamodb:PutItem": ["SIGN_UP_VERIFICATION#*"],
    "dynamodb:UpdateItem": ["SIGN_UP_CODE#*", "SIGN_UP_VERIFY_ATTEMPTS#*"],
    "dynamodb:DeleteItem": ["SIGN_UP_CODE#*"],
  });
  assert.deepEqual(accessByAction(template, "SignInFunction"), {
    "dynamodb:UpdateItem": ["SIGN_IN_ATTEMPTS#*"],
  });
  assert.deepEqual(accessByAction(template, "MeFunction"), {
    "dynamodb:Query": ["USER#*"],
    "dynamodb:GetItem": ["ACCOUNT#*"],
  });
  const meStatements = policyFor(template, "MeFunction");
  for (const forbidden of [
    "PutItem",
    "UpdateItem",
    "DeleteItem",
    "CLINIC#*",
    "/index/GSI1",
    "/index/*",
    "cognito-idp:",
    "ses:",
  ]) {
    assert.equal(meStatements.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(accessByAction(template, "SavePersonalDataFunction"), {
    "dynamodb:UpdateItem": ["USER#*"],
    "dynamodb:Query": ["USER#*"],
  });
  const savePersonalDataStatements = policyFor(
    template,
    "SavePersonalDataFunction",
  );
  for (const forbidden of [
    "PutItem",
    "DeleteItem",
    "GetItem",
    "ACCOUNT#*",
    "CLINIC#*",
    "/index/GSI1",
    "cognito-idp:",
    "ses:",
  ]) {
    assert.equal(
      savePersonalDataStatements.includes(forbidden),
      false,
      forbidden,
    );
  }
  assert.deepEqual(accessByAction(template, "RefreshSessionFunction"), {});
  assert.deepEqual(accessByAction(template, "SignOutFunction"), {});
});

test("la confirmación crea y borra usuarios en Cognito, inicia la sesión, consulta sólo el índice por correo y no envía correos", () => {
  const template = synthesizeBackend();
  const policy = policyFor(template, "ConfirmSignUpFunction");

  const cognitoActions = JSON.parse(policy)
    .Statement.flatMap(({ Action }: { Action: string | string[] }) => Action)
    .filter((action: string) => action.startsWith("cognito-idp:"))
    .sort();
  assert.deepEqual(cognitoActions, [
    "cognito-idp:AdminCreateUser",
    "cognito-idp:AdminDeleteUser",
    "cognito-idp:AdminInitiateAuth",
    "cognito-idp:AdminSetUserPassword",
    "cognito-idp:DescribeUserPoolClient",
  ]);
  for (const expected of ["dynamodb:Query", "/index/GSI1"]) {
    assert.ok(policy.includes(expected), expected);
  }
  for (const forbidden of [
    "ses:",
    "/index/*",
    "EMAIL_SEND_ATTEMPTS#*",
    "SIGN_UP_CODE#*",
  ]) {
    assert.equal(policy.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(
    Object.keys(
      functionProperties(template, "ConfirmSignUpFunction").Environment
        .Variables,
    ).sort(),
    [
      "NODE_OPTIONS",
      "PLATFORM_CLIENT_ID",
      "TABLE_NAME",
      "TERMS_ACCEPTANCE_REQUIRED",
      "USER_POOL_ID",
    ],
  );
});

test("sólo la confirmación y el inicio de sesión inician sesiones, y sólo las cuatro Lambdas de la sesión leen el secreto del cliente", () => {
  const template = synthesizeBackend();

  for (const functionName of [
    "RequestSignUpCodeFunction",
    "VerifySignUpCodeFunction",
  ]) {
    const policy = policyFor(template, functionName);
    assert.equal(policy.includes("AdminInitiateAuth"), false, functionName);
    assert.equal(
      policy.includes("DescribeUserPoolClient"),
      false,
      functionName,
    );
  }
});

test("renovar y cerrar la sesión sólo leen el secreto del cliente, sin tabla, correos ni más permisos de Cognito", () => {
  const template = synthesizeBackend();

  for (const functionName of ["RefreshSessionFunction", "SignOutFunction"]) {
    const statements: { Action: string | string[] }[] = JSON.parse(
      policyFor(template, functionName),
    ).Statement;
    assert.deepEqual(
      statements.flatMap(({ Action }) => Action),
      ["cognito-idp:DescribeUserPoolClient"],
      functionName,
    );
    assert.deepEqual(
      Object.keys(
        functionProperties(template, functionName).Environment.Variables,
      ).sort(),
      ["NODE_OPTIONS", "PLATFORM_CLIENT_ID", "USER_POOL_ID"],
      functionName,
    );
  }
});

test("el inicio de sesión sólo inicia sesiones, lee el secreto del cliente, cuenta intentos y consulta el índice por sub", () => {
  const template = synthesizeBackend();
  const policy = policyFor(template, "SignInFunction");

  const cognitoActions = JSON.parse(policy)
    .Statement.flatMap(({ Action }: { Action: string | string[] }) => Action)
    .filter((action: string) => action.startsWith("cognito-idp:"))
    .sort();
  assert.deepEqual(cognitoActions, [
    "cognito-idp:AdminInitiateAuth",
    "cognito-idp:DescribeUserPoolClient",
  ]);
  for (const expected of ["dynamodb:Query", "/index/GSI2"]) {
    assert.ok(policy.includes(expected), expected);
  }
  for (const forbidden of [
    "ses:",
    "/index/GSI1",
    "/index/*",
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:DeleteItem",
    "USER#*",
  ]) {
    assert.equal(policy.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(
    Object.keys(
      functionProperties(template, "SignInFunction").Environment.Variables,
    ).sort(),
    ["NODE_OPTIONS", "PLATFORM_CLIENT_ID", "TABLE_NAME", "USER_POOL_ID"],
  );
});

test("el inicio de sesión no cambia lo que consultan las Lambdas del registro", () => {
  const template = synthesizeBackend();

  for (const functionName of [
    "RequestSignUpCodeFunction",
    "ConfirmSignUpFunction",
  ]) {
    const policy = policyFor(template, functionName);
    assert.ok(policy.includes("/index/GSI1"), functionName);
    assert.equal(policy.includes("/index/GSI2"), false, functionName);
  }
});

test("la verificación del código no envía correos, no toca Cognito ni usuarios y no consulta índices", () => {
  const policy = policyFor(synthesizeBackend(), "VerifySignUpCodeFunction");

  for (const forbidden of [
    "ses:",
    "cognito-idp",
    "dynamodb:Query",
    "/index/",
    "USER#*",
    "EMAIL_SEND_ATTEMPTS#*",
  ]) {
    assert.equal(policy.includes(forbidden), false, forbidden);
  }
});

test("la Lambda de la verificación sólo recibe el nombre de la tabla", () => {
  const { Environment } = functionProperties(
    synthesizeBackend(),
    "VerifySignUpCodeFunction",
  );

  assert.deepEqual(Object.keys(Environment.Variables).sort(), [
    "NODE_OPTIONS",
    "TABLE_NAME",
  ]);
});

test("el pedido del código escribe sólo sus prefijos, consulta sólo el índice por correo, envía con sus dos plantillas y no toca Cognito", () => {
  const policy = policyFor(synthesizeBackend(), "RequestSignUpCodeFunction");

  for (const expected of [
    "dynamodb:PutItem",
    "dynamodb:LeadingKeys",
    "SIGN_UP_CODE#*",
    "SIGN_UP_NOTICE#*",
    "EMAIL_SEND_ATTEMPTS#*",
    "dynamodb:Query",
    "/index/GSI1",
    "ses:SendTemplatedEmail",
    ":identity/*",
    ":template/BackendTest-sign-up-code",
    ":template/BackendTest-account-exists",
  ]) {
    assert.ok(policy.includes(expected), expected);
  }
  for (const forbidden of ["cognito-idp", "USER#*", "/index/*"]) {
    assert.equal(policy.includes(forbidden), false, forbidden);
  }
});

test("la Lambda del pedido del código recibe los nombres de sus dos plantillas y se crea después de ellas", () => {
  const template = synthesizeBackend();
  const sesTemplates = template.findResources("AWS::SES::Template");

  assert.deepEqual(
    Object.values(sesTemplates)
      .map((resource) => resource.Properties.Template.TemplateName)
      .sort(),
    ["BackendTest-account-exists", "BackendTest-sign-up-code"],
  );
  const { Variables } = functionProperties(
    template,
    "RequestSignUpCodeFunction",
  ).Environment;
  assert.equal(Variables.ACCOUNT_EXISTS_TEMPLATE, "BackendTest-account-exists");
  assert.equal(Variables.SIGN_UP_CODE_TEMPLATE, "BackendTest-sign-up-code");
  const { DependsOn } = template.findResources("AWS::Lambda::Function")[
    functionLogicalId(template, "RequestSignUpCodeFunction")
  ];
  for (const sesTemplateId of Object.keys(sesTemplates)) {
    assert.ok(DependsOn.includes(sesTemplateId));
  }
});

test("el pedido del código puede enviar sus dos plantillas", () => {
  const template = synthesizeBackend();
  const policy = policyFor(template, "RequestSignUpCodeFunction");

  assert.ok(policy.includes(":template/BackendTest-sign-up-code"));
  assert.ok(policy.includes(":template/BackendTest-account-exists"));
});

test("las Lambdas de los usuarios tienen 15 segundos, 512 MB y logs que se conservan un mes", () => {
  const template = synthesizeBackend();

  for (const functionName of [
    "RequestSignUpCodeFunction",
    "VerifySignUpCodeFunction",
    "ConfirmSignUpFunction",
    "SignInFunction",
    "RefreshSessionFunction",
    "SignOutFunction",
    "MeFunction",
    "SavePersonalDataFunction",
  ]) {
    const properties = functionProperties(template, functionName);
    assert.equal(properties.Timeout, 15, functionName);
    assert.equal(properties.MemorySize, 512, functionName);
    assert.equal(
      properties.Environment.Variables.NODE_OPTIONS,
      "--enable-source-maps",
      functionName,
    );
  }
  assert.equal(
    Object.values(template.findResources("AWS::Logs::LogGroup")).filter(
      (logGroup) => logGroup.Properties.RetentionInDays === 30,
    ).length >= 6,
    true,
  );
});

test("el flag de los términos llega apagado a la Lambda de la confirmación salvo que se encienda", () => {
  const flagOf = (template: Template) =>
    functionProperties(template, "ConfirmSignUpFunction").Environment.Variables
      .TERMS_ACCEPTANCE_REQUIRED;

  assert.equal(
    flagOf(synthesizeBackend({ termsAcceptanceRequired: false })),
    "false",
  );
  assert.equal(
    flagOf(synthesizeBackend({ termsAcceptanceRequired: true })),
    "true",
  );
});

test("las Lambdas pueden enviar a cualquier identidad, como el destinatario en el sandbox, pero sólo desde la dirección de EMAIL_FROM", () => {
  const template = synthesizeBackend({
    emailFrom: "WizyDoc <no-reply@support.wizydoc.app>",
  });

  const sendEmailStatement = JSON.parse(
    policyFor(template, "RequestSignUpCodeFunction"),
  ).Statement.find(
    (statement: { Action: string | string[] }) =>
      JSON.stringify(statement.Action) === '"ses:SendTemplatedEmail"',
  );
  assert.ok(sendEmailStatement);
  assert.ok(
    JSON.stringify(sendEmailStatement.Resource).includes(":identity/*"),
  );
  assert.deepEqual(sendEmailStatement.Condition, {
    StringEquals: { "ses:FromAddress": "no-reply@support.wizydoc.app" },
  });
});

test("la tabla borra con TTL los ítems con DeleteAfter", () => {
  synthesizeBackend().hasResourceProperties("AWS::DynamoDB::GlobalTable", {
    TimeToLiveSpecification: { AttributeName: "DeleteAfter", Enabled: true },
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({ IndexName: "GSI1" }),
    ]),
  });
});

test("el stack tiene un solo user pool, con el cliente de platform, y la confirmación recibe su id", () => {
  const template = synthesizeBackend();
  const [poolLogicalId] = Object.keys(
    template.findResources("AWS::Cognito::UserPool"),
  );

  assert.equal(
    Object.keys(template.findResources("AWS::Cognito::UserPool")).length,
    1,
  );
  const clients = Object.values(
    template.findResources("AWS::Cognito::UserPoolClient"),
  );
  assert.equal(clients.length, 1);
  for (const client of clients) {
    assert.deepEqual(client.Properties.UserPoolId, { Ref: poolLogicalId });
  }
  assert.deepEqual(
    functionProperties(template, "ConfirmSignUpFunction").Environment.Variables
      .USER_POOL_ID,
    { Ref: poolLogicalId },
  );
});

const PUBLIC_ROUTES = [
  "GET /health",
  "POST /api/auth/sign-in",
  "POST /api/auth/sign-out",
  "POST /api/auth/sign-up/code",
  "POST /api/auth/sign-up/code/verify",
  "POST /api/auth/sign-up/confirm",
  "POST /api/auth/token/refresh",
];

const functionOfMethod = (template: Template, integrationUri: unknown) => {
  const [logicalId] = Object.keys(
    template.findResources("AWS::Lambda::Function"),
  ).filter((id) => JSON.stringify(integrationUri).includes(id));
  assert.ok(logicalId, "el método no tiene una Lambda");
  return {
    logicalId,
    properties: template.findResources("AWS::Lambda::Function")[logicalId]
      .Properties,
  };
};

test("toda ruta privada declara su policy y exige la clave de platform y el ID token", () => {
  const template = synthesizeBackend();
  const methods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  );
  const authorizers = Object.entries(
    template.findResources("AWS::ApiGateway::Authorizer"),
  );

  assert.equal(authorizers.length, 1);
  const [clientLogicalId] = Object.keys(
    template.findResources("AWS::Cognito::UserPoolClient"),
  );
  assert.deepEqual(authorizers[0][1].Properties.IdentityValidationExpression, {
    "Fn::Join": ["", ["^", { Ref: clientLogicalId }, "$"]],
  });
  const privateMethods = methods.filter(
    ({ Properties }) =>
      !PUBLIC_ROUTES.includes(
        `${Properties.HttpMethod} ${resourcePath(template, Properties.ResourceId.Ref)}`,
      ),
  );
  assert.ok(privateMethods.length > 0);
  for (const { Properties } of privateMethods) {
    assert.equal(Properties.AuthorizationType, "COGNITO_USER_POOLS");
    assert.deepEqual(Properties.AuthorizerId, { Ref: authorizers[0][0] });
    assert.equal(Properties.ApiKeyRequired, true);
    const { ROUTE_POLICY } = functionOfMethod(
      template,
      Properties.Integration.Uri,
    ).properties.Environment.Variables;
    assert.ok(routePolicySchema.safeParse(JSON.parse(ROUTE_POLICY)).success);
  }
  for (const { Properties } of methods) {
    assert.equal(Properties.ApiKeyRequired, true);
  }
});

test("toda Lambda de una ruta privada puede leer al usuario de la sesión y sus memberships", () => {
  const template = synthesizeBackend();

  const privateMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  ).filter(({ Properties }) => Properties.AuthorizerId);
  assert.ok(privateMethods.length > 0);
  for (const { Properties } of privateMethods) {
    const { logicalId, properties } = functionOfMethod(
      template,
      Properties.Integration.Uri,
    );

    assert.deepEqual(accessByAction(template, logicalId)["dynamodb:Query"], [
      "USER#*",
    ]);
    assert.ok(
      policyFor(template, logicalId).includes("/index/GSI2"),
      logicalId,
    );
    assert.ok(properties.Environment.Variables.TABLE_NAME, logicalId);
    const { resourceType } = JSON.parse(
      properties.Environment.Variables.ROUTE_POLICY,
    );
    const clinicReads = accessByAction(template, logicalId)["dynamodb:GetItem"];
    assert.equal(
      clinicReads?.includes("CLINIC#*") ?? false,
      resourceType === "CLINIC",
      logicalId,
    );
  }
});

const LAMBDA_DESCRIPTION_MAX_LENGTH = 256;

test("toda Lambda del stack dice en su descripción qué hace", () => {
  const functions = Object.entries(
    synthesizeBackend().findResources("AWS::Lambda::Function"),
  );

  assert.ok(functions.length > 0);
  for (const [logicalId, lambdaFunction] of functions) {
    const description: string | undefined =
      lambdaFunction.Properties.Description;
    assert.ok(description, `${logicalId} no tiene descripción`);
    assert.doesNotMatch(description, /\/api\/|\b(GET|POST)\b/, logicalId);
    assert.ok(
      description.length <= LAMBDA_DESCRIPTION_MAX_LENGTH,
      `la descripción de ${logicalId} pasa de ${LAMBDA_DESCRIPTION_MAX_LENGTH} caracteres`,
    );
  }
});

const ONBOARDING_ROUTES = [
  {
    method: "PUT",
    path: "/api/onboarding/personal-data",
    functionName: "SavePersonalDataFunction",
    policy: { onboardingStep: ["PERSONAL_DATA", "PLAN", "CLINIC"] },
  },
];

test("las cuatro rutas del onboarding exigen la clave de platform y el ID token, y declaran su policy", () => {
  const template = synthesizeBackend();
  const methods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  );

  for (const { method, path, functionName, policy } of ONBOARDING_ROUTES) {
    const [{ Properties }] = methods.filter(
      (candidate) =>
        candidate.Properties.HttpMethod === method &&
        resourcePath(template, candidate.Properties.ResourceId.Ref) === path,
    );

    assert.equal(Properties.ApiKeyRequired, true, path);
    assert.equal(Properties.AuthorizationType, "COGNITO_USER_POOLS", path);
    assert.ok(
      JSON.stringify(Properties.Integration.Uri).includes(
        functionLogicalId(template, functionName),
      ),
      path,
    );
    assert.deepEqual(
      JSON.parse(
        functionProperties(template, functionName).Environment.Variables
          .ROUTE_POLICY,
      ),
      policy,
      path,
    );
  }
});
