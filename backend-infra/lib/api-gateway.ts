import { CfnOutput } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import type * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

// Techo de costo ante una clave filtrada o un bucle, no un límite por usuario:
// todo el tráfico llega desde el servidor de platform.
const PLATFORM_REQUESTS_PER_SECOND = 100;
const PLATFORM_BURST_REQUESTS = 200;

const AccessLogField = apigateway.AccessLogField;

// Sin la ruta: lleva los tokens de invitación, de autogestión y de cambio de
// contraseña (ver requestSerializer en api/src/server.ts).
const accessLogFormat = apigateway.AccessLogFormat.custom(
  JSON.stringify({
    requestId: AccessLogField.contextRequestId(),
    requestTime: AccessLogField.contextRequestTime(),
    method: AccessLogField.contextHttpMethod(),
    status: AccessLogField.contextStatus(),
    errorType: AccessLogField.contextErrorResponseType(),
    integrationError: AccessLogField.contextIntegrationErrorMessage(),
    latencyMs: AccessLogField.contextResponseLatency(),
    integrationLatencyMs: AccessLogField.contextIntegrationLatency(),
    responseLength: AccessLogField.contextResponseLength(),
    sourceIp: AccessLogField.contextIdentitySourceIp(),
  }),
);

export interface ApiGatewayProps {
  handler: lambda.IFunction;
  hostedZone: route53.IHostedZone;
  domainName: string;
}

export class ApiGateway extends Construct {
  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    const accessLogs = new logs.LogGroup(this, "AccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const api = new apigateway.RestApi(this, "Api", {
      // Regional y no edge: quien llama es el servidor de platform, no el navegador.
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      domainName: { domainName: props.domainName, certificate },
      disableExecuteApiEndpoint: true,
      defaultIntegration: new apigateway.LambdaIntegration(props.handler),
      // El navegador nunca llama al api (platform lo hace desde su servidor y
      // con rewrites), así que la clave sólo vive en el servidor de platform.
      defaultMethodOptions: { apiKeyRequired: true },
      // API Gateway escribe logs con un único rol por cuenta y región.
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogs),
        accessLogFormat,
      },
    });
    // CDK siempre publica la URL execute-api, que está apagada: copiada en
    // API_URL, platform recibiría 403 en todo.
    api.node.tryRemoveChild("Endpoint");
    api.root.addProxy();

    const platformApiKey = api.addApiKey("PlatformApiKey");
    const platformUsagePlan = api.addUsagePlan("PlatformUsagePlan", {
      throttle: {
        rateLimit: PLATFORM_REQUESTS_PER_SECOND,
        burstLimit: PLATFORM_BURST_REQUESTS,
      },
      apiStages: [{ api, stage: api.deploymentStage }],
    });
    platformUsagePlan.addApiKey(platformApiKey);

    new route53.ARecord(this, "AliasRecord", {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGateway(api),
      ),
    });

    new CfnOutput(this, "PlatformApiKeyId", { value: platformApiKey.keyId });
  }
}
