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

test("las dos rutas son POST y exigen la clave de platform", () => {
  const template = synthesizeBackend();

  const postMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method", {
      Properties: { HttpMethod: "POST" },
    }),
  );

  assert.equal(postMethods.length, 2);
  for (const method of postMethods) {
    assert.equal(method.Properties.ApiKeyRequired, true);
  }
  template.hasResourceProperties("AWS::ApiGateway::Resource", {
    PathPart: "email",
  });
  template.hasResourceProperties("AWS::ApiGateway::Resource", {
    PathPart: "resend-confirmation",
  });
});

test("el registro crea y borra usuarios en Cognito, escribe sólo sus prefijos, consulta sólo el índice por correo y envía correos", () => {
  const policy = policyFor(synthesizeBackend(), "SignUpFunction");

  for (const expected of [
    "cognito-idp:AdminCreateUser",
    "cognito-idp:AdminSetUserPassword",
    "cognito-idp:AdminDeleteUser",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:LeadingKeys",
    "USER#*",
    "EMAIL_CONFIRMATION#*",
    "EMAIL_SEND_ATTEMPTS#*",
    "dynamodb:Query",
    "/index/GSI1",
    "ses:SendEmail",
    ":identity/*",
  ]) {
    assert.ok(policy.includes(expected), expected);
  }
  assert.equal(policy.includes("/index/*"), false);
});

test("el reenvío no toca Cognito ni escribe usuarios", () => {
  const policy = policyFor(synthesizeBackend(), "ResendConfirmationFunction");

  assert.equal(policy.includes("cognito-idp"), false);
  assert.equal(policy.includes("USER#*"), false);
  assert.ok(policy.includes("EMAIL_CONFIRMATION#*"));
  assert.ok(policy.includes("ses:SendEmail"));
});

test("las dos Lambdas reciben los nombres de las tres plantillas del stack y se crean después de ellas", () => {
  const template = synthesizeBackend();
  const sesTemplates = template.findResources("AWS::SES::Template");

  assert.deepEqual(
    Object.values(sesTemplates)
      .map((resource) => resource.Properties.Template.TemplateName)
      .sort(),
    [
      "BackendTest-account-exists",
      "BackendTest-confirm-email",
      "BackendTest-pending-confirmation",
    ],
  );
  for (const functionName of ["SignUpFunction", "ResendConfirmationFunction"]) {
    const {
      CONFIRM_EMAIL_TEMPLATE,
      PENDING_CONFIRMATION_TEMPLATE,
      ACCOUNT_EXISTS_TEMPLATE,
    } = functionProperties(template, functionName).Environment.Variables;
    assert.deepEqual(
      {
        CONFIRM_EMAIL_TEMPLATE,
        PENDING_CONFIRMATION_TEMPLATE,
        ACCOUNT_EXISTS_TEMPLATE,
      },
      {
        CONFIRM_EMAIL_TEMPLATE: "BackendTest-confirm-email",
        PENDING_CONFIRMATION_TEMPLATE: "BackendTest-pending-confirmation",
        ACCOUNT_EXISTS_TEMPLATE: "BackendTest-account-exists",
      },
      functionName,
    );

    const { DependsOn } = template.findResources("AWS::Lambda::Function")[
      functionLogicalId(template, functionName)
    ];
    for (const sesTemplateId of Object.keys(sesTemplates)) {
      assert.ok(DependsOn.includes(sesTemplateId), functionName);
    }
  }
});

test("el registro puede enviar con sus tres plantillas, y el reenvío sólo con la de confirmación", () => {
  const template = synthesizeBackend();
  const signUpPolicy = policyFor(template, "SignUpFunction");
  const resendPolicy = policyFor(template, "ResendConfirmationFunction");

  for (const templateName of [
    "confirm-email",
    "pending-confirmation",
    "account-exists",
  ]) {
    assert.ok(
      signUpPolicy.includes(`:template/BackendTest-${templateName}`),
      templateName,
    );
  }
  assert.ok(resendPolicy.includes(":template/BackendTest-confirm-email"));
  assert.equal(
    resendPolicy.includes("BackendTest-pending-confirmation"),
    false,
  );
  assert.equal(resendPolicy.includes("BackendTest-account-exists"), false);
});

test("las dos Lambdas tienen 15 segundos, 512 MB y logs que se conservan un mes", () => {
  const template = synthesizeBackend();

  for (const functionName of ["SignUpFunction", "ResendConfirmationFunction"]) {
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
    ).length >= 2,
    true,
  );
});

test("el flag de los términos llega apagado a la Lambda del registro salvo que se encienda", () => {
  const flagOf = (template: Template) =>
    functionProperties(template, "SignUpFunction").Environment.Variables
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

  for (const functionName of ["SignUpFunction", "ResendConfirmationFunction"]) {
    const sendEmailStatement = JSON.parse(
      policyFor(template, functionName),
    ).Statement.find(
      (statement: { Action: string | string[] }) =>
        JSON.stringify(statement.Action) === '"ses:SendEmail"',
    );
    assert.ok(sendEmailStatement, functionName);
    assert.ok(
      JSON.stringify(sendEmailStatement.Resource).includes(":identity/*"),
      functionName,
    );
    assert.deepEqual(
      sendEmailStatement.Condition,
      { StringEquals: { "ses:FromAddress": "no-reply@support.wizydoc.app" } },
      functionName,
    );
  }
});

test("la tabla borra con TTL los ítems con DeleteAfter", () => {
  synthesizeBackend().hasResourceProperties("AWS::DynamoDB::GlobalTable", {
    TimeToLiveSpecification: { AttributeName: "DeleteAfter", Enabled: true },
    GlobalSecondaryIndexes: Match.arrayWith([
      Match.objectLike({ IndexName: "GSI1" }),
    ]),
  });
});
