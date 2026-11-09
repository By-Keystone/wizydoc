import assert from "node:assert/strict";
import { test } from "node:test";
import * as vm from "node:vm";
import { App, Stack } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Template } from "aws-cdk-lib/assertions";
import * as route53 from "aws-cdk-lib/aws-route53";
import { ApiGateway } from "../lib/api-gateway";

function synthesizeApiGateway() {
  const stack = new Stack(new App(), "ApiGatewayTest", {
    env: { account: "111111111111", region: "us-east-2" },
  });
  const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
    stack,
    "HostedZone",
    { hostedZoneId: "Z0000000000000000000", zoneName: "wizydoc.app" },
  );

  const apiGateway = new ApiGateway(stack, "ApiGateway", {
    hostedZone,
    domainName: "api.wizydoc.app",
  });
  apiGateway.api.root
    .addResource("example")
    .addMethod("GET", new apigateway.MockIntegration());

  return Template.fromStack(stack);
}

test("todo método exige la clave de platform", () => {
  const template = synthesizeApiGateway();

  const methods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  );

  assert.ok(methods.length > 0);
  for (const method of methods) {
    assert.equal(method.Properties.ApiKeyRequired, true);
  }
});

test("no hay una ruta comodín: sólo responden las rutas declaradas", () => {
  const template = synthesizeApiGateway();

  const pathParts = Object.values(
    template.findResources("AWS::ApiGateway::Resource"),
  ).map((resource) => resource.Properties.PathPart);
  const httpMethods = Object.values(
    template.findResources("AWS::ApiGateway::Method"),
  ).map((method) => method.Properties.HttpMethod);

  assert.deepEqual(pathParts, ["example"]);
  assert.deepEqual(httpMethods, ["GET"]);
});

test("una ruta que no existe responde 404", () => {
  synthesizeApiGateway().hasResourceProperties(
    "AWS::ApiGateway::GatewayResponse",
    {
      ResponseType: "MISSING_AUTHENTICATION_TOKEN",
      StatusCode: "404",
    },
  );
});

test("la URL execute-api queda apagada y sólo responde el dominio propio", () => {
  const template = synthesizeApiGateway();

  template.hasResourceProperties("AWS::ApiGateway::RestApi", {
    DisableExecuteApiEndpoint: true,
  });
  template.hasResourceProperties("AWS::ApiGateway::DomainName", {
    DomainName: "api.wizydoc.app",
  });
  template.hasResourceProperties("AWS::Route53::RecordSet", {
    Name: "api.wizydoc.app.",
    Type: "A",
  });
  const outputIds = Object.keys(template.findOutputs("*"));
  assert.equal(outputIds.length, 1);
  assert.match(outputIds[0], /^ApiGatewayPlatformApiKeyId/);
});

test("el log de acceso no guarda la ruta, que lleva tokens", () => {
  const template = synthesizeApiGateway();

  const [stage] = Object.values(
    template.findResources("AWS::ApiGateway::Stage"),
  );
  const accessLogFormat: string = stage.Properties.AccessLogSetting.Format;

  assert.doesNotMatch(accessLogFormat, /\$context\.path/);
});

test("la etapa no registra los cuerpos de los pedidos ni de las respuestas", () => {
  const template = synthesizeApiGateway();

  const [stage] = Object.values(
    template.findResources("AWS::ApiGateway::Stage"),
  );
  const methodSettings: { DataTraceEnabled?: boolean }[] =
    stage.Properties.MethodSettings ?? [];

  for (const { DataTraceEnabled } of methodSettings) {
    assert.notEqual(DataTraceEnabled, true);
  }
});

const REDEPLOY_FUNCTION = "ApiGatewayRedeployStaleStageFunction";
const REST_API_ID = "api0000000";
const STAGE_NAME = "prod";
const STAGE_REVIEW_COMMANDS = [
  "CreateDeploymentCommand",
  "GetDeploymentCommand",
  "GetResourcesCommand",
  "GetStageCommand",
];

type SentCommand = { name: string; input: Record<string, unknown> };
type StageReviewModule = { handler?: () => Promise<void> };

const redeployFunctionOf = (template: Template) => {
  const entry = Object.entries(
    template.findResources("AWS::Lambda::Function"),
  ).find(([logicalId]) => logicalId.startsWith(REDEPLOY_FUNCTION));
  assert.ok(entry, "no se encontró la Lambda que revisa la etapa");
  return { logicalId: entry[0], properties: entry[1].Properties };
};

function loadStageReview(responses: Record<string, unknown[]>) {
  const { properties } = redeployFunctionOf(synthesizeApiGateway());
  const sent: SentCommand[] = [];
  const fakeSdk: Record<string, unknown> = {
    APIGatewayClient: class {
      async send(command: SentCommand) {
        sent.push(command);
        return responses[command.name]?.shift() ?? {};
      }
    },
  };
  for (const name of STAGE_REVIEW_COMMANDS) {
    fakeSdk[name] = class {
      readonly name = name;
      constructor(readonly input: Record<string, unknown>) {}
    };
  }

  const stageReview: StageReviewModule = {};
  vm.runInThisContext(
    `(function (require, exports, process) {${properties.Code.ZipFile}\n})`,
  )(() => fakeSdk, stageReview, {
    env: { REST_API_ID, STAGE_NAME },
  });
  assert.ok(stageReview.handler);
  return { handler: stageReview.handler, sent };
}

test("si la etapa publica una ruta que el API ya no tiene, publica un deployment nuevo de la etapa", async (context) => {
  context.mock.method(console, "log", () => {});
  const { handler, sent } = loadStageReview({
    GetStageCommand: [{ deploymentId: "deployment-viejo" }],
    GetDeploymentCommand: [
      {
        apiSummary: {
          "/{proxy+}": { ANY: {} },
          "/health": { GET: {} },
        },
      },
    ],
    GetResourcesCommand: [
      {
        items: [
          { path: "/" },
          { path: "/health", resourceMethods: { GET: {} } },
        ],
      },
    ],
  });

  await handler();

  assert.deepEqual(
    sent.map((command) => command.name),
    [
      "GetStageCommand",
      "GetDeploymentCommand",
      "GetResourcesCommand",
      "CreateDeploymentCommand",
    ],
  );
  assert.deepEqual(sent[1].input, {
    restApiId: REST_API_ID,
    deploymentId: "deployment-viejo",
    embed: ["apisummary"],
  });
  assert.deepEqual(sent[3].input, {
    restApiId: REST_API_ID,
    stageName: STAGE_NAME,
  });
});

test("si la etapa publica las mismas rutas que el API, no crea un deployment", async () => {
  const { handler, sent } = loadStageReview({
    GetStageCommand: [{ deploymentId: "deployment-actual" }],
    GetDeploymentCommand: [
      {
        apiSummary: {
          "/health": { GET: {} },
          "/api/auth/sign-up/code": { POST: {} },
        },
      },
    ],
    GetResourcesCommand: [
      {
        items: [
          { path: "/api/auth/sign-up/code", resourceMethods: { POST: {} } },
          { path: "/api/auth/sign-up" },
          { path: "/health", resourceMethods: { GET: {} } },
        ],
      },
    ],
  });

  await handler();

  assert.ok(
    !sent.some((command) => command.name === "CreateDeploymentCommand"),
  );
});

test("compara con todas las páginas de recursos del API", async () => {
  const { handler, sent } = loadStageReview({
    GetStageCommand: [{ deploymentId: "deployment-actual" }],
    GetDeploymentCommand: [
      {
        apiSummary: {
          "/health": { GET: {} },
          "/api/auth/sign-up/code": { POST: {} },
        },
      },
    ],
    GetResourcesCommand: [
      {
        items: [{ path: "/health", resourceMethods: { GET: {} } }],
        position: "pagina-2",
      },
      {
        items: [
          { path: "/api/auth/sign-up/code", resourceMethods: { POST: {} } },
        ],
      },
    ],
  });

  await handler();

  const resourcePages = sent.filter(
    (command) => command.name === "GetResourcesCommand",
  );
  assert.equal(resourcePages.length, 2);
  assert.equal(resourcePages[1].input.position, "pagina-2");
  assert.ok(
    !sent.some((command) => command.name === "CreateDeploymentCommand"),
  );
});

test("sólo la actualización completa de su propio stack dispara la revisión de la etapa", () => {
  const template = synthesizeApiGateway();
  const { logicalId } = redeployFunctionOf(template);

  template.hasResourceProperties("AWS::Events::Rule", {
    EventPattern: {
      source: ["aws.cloudformation"],
      "detail-type": ["CloudFormation Stack Status Change"],
      detail: {
        "stack-id": [{ Ref: "AWS::StackId" }],
        "status-details": { status: ["UPDATE_COMPLETE"] },
      },
    },
    Targets: [{ Arn: { "Fn::GetAtt": [logicalId, "Arn"] }, Id: "Target0" }],
  });
  assert.equal(
    Object.keys(template.findResources("AWS::Events::Rule")).length,
    1,
  );
});

test("la revisión de la etapa sólo lee ese API y sólo crea deployments en él", () => {
  const template = synthesizeApiGateway();
  const { properties } = redeployFunctionOf(template);
  const role = properties.Role["Fn::GetAtt"][0];
  const [policy] = Object.values(
    template.findResources("AWS::IAM::Policy"),
  ).filter((candidate) =>
    JSON.stringify(candidate.Properties.Roles).includes(role),
  );
  const restApiArn = (resourcePath: string) => ({
    "Fn::Join": [
      "",
      [
        "arn:",
        { Ref: "AWS::Partition" },
        ":apigateway:us-east-2::/restapis/",
        { Ref: properties.Environment.Variables.REST_API_ID.Ref },
        resourcePath,
      ],
    ],
  });

  assert.deepEqual(policy.Properties.PolicyDocument.Statement, [
    { Action: "apigateway:GET", Effect: "Allow", Resource: restApiArn("/*") },
    {
      Action: "apigateway:POST",
      Effect: "Allow",
      Resource: restApiArn("/deployments"),
    },
  ]);
});
