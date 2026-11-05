import assert from "node:assert/strict";
import { test } from "node:test";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as route53 from "aws-cdk-lib/aws-route53";
import { ApiGateway } from "../lib/api-gateway";

function synthesizeApiGateway() {
  const stack = new Stack(new App(), "ApiGatewayTest", {
    env: { account: "111111111111", region: "us-east-2" },
  });
  const handler = new lambda.Function(stack, "Handler", {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: lambda.Code.fromInline("exports.handler = async () => ({});"),
  });
  const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
    stack,
    "HostedZone",
    { hostedZoneId: "Z0000000000000000000", zoneName: "wizydoc.app" },
  );

  new ApiGateway(stack, "ApiGateway", {
    handler,
    hostedZone,
    domainName: "api.wizydoc.app",
  });

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
