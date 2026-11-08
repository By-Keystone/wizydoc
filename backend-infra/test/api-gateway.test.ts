import assert from "node:assert/strict";
import { test } from "node:test";
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
