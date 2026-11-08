import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
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

test("las tres rutas son POST y exigen la clave de platform", () => {
  const template = synthesizeBackend();

  const postMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method", {
      Properties: { HttpMethod: "POST" },
    }),
  );

  assert.equal(postMethods.length, 3);
  for (const method of postMethods) {
    assert.equal(method.Properties.ApiKeyRequired, true);
  }
  template.hasResourceProperties("AWS::ApiGateway::Resource", {
    PathPart: "code",
  });
  template.hasResourceProperties("AWS::ApiGateway::Resource", {
    PathPart: "verify",
  });
  template.hasResourceProperties("AWS::ApiGateway::Resource", {
    PathPart: "confirm",
  });
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

test("cada Lambda usa en DynamoDB sólo las acciones y los prefijos que usa", () => {
  const template = synthesizeBackend();

  assert.deepEqual(accessByAction(template, "RequestSignUpCodeFunction"), {
    "dynamodb:PutItem": ["SIGN_UP_CODE#*", "SIGN_UP_NOTICE#*"],
    "dynamodb:UpdateItem": ["EMAIL_SEND_ATTEMPTS#*"],
  });
  assert.deepEqual(accessByAction(template, "ConfirmSignUpFunction"), {
    "dynamodb:GetItem": ["SIGN_UP_VERIFICATION#*"],
    "dynamodb:PutItem": ["USER#*"],
    "dynamodb:DeleteItem": ["SIGN_UP_VERIFICATION#*"],
  });
  assert.deepEqual(accessByAction(template, "VerifySignUpCodeFunction"), {
    "dynamodb:PutItem": ["SIGN_UP_VERIFICATION#*"],
    "dynamodb:UpdateItem": ["SIGN_UP_CODE#*", "SIGN_UP_VERIFY_ATTEMPTS#*"],
    "dynamodb:DeleteItem": ["SIGN_UP_CODE#*"],
  });
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

test("sólo la confirmación puede iniciar sesiones y leer el secreto del cliente", () => {
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

test("las tres Lambdas tienen 15 segundos, 512 MB y logs que se conservan un mes", () => {
  const template = synthesizeBackend();

  for (const functionName of [
    "RequestSignUpCodeFunction",
    "VerifySignUpCodeFunction",
    "ConfirmSignUpFunction",
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
    ).length >= 3,
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
