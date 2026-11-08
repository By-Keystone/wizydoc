import { CfnOutput } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

const PLATFORM_REQUESTS_PER_SECOND = 100;
const PLATFORM_BURST_REQUESTS = 200;

const DISABLED_EXECUTE_API_URL_OUTPUT = "Endpoint";
const UNKNOWN_ROUTE_BODY = JSON.stringify({ message: "Not found" });

const AccessLogField = apigateway.AccessLogField;

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
  hostedZone: route53.IHostedZone;
  domainName: string;
}

export class ApiGateway extends Construct {
  readonly api: apigateway.RestApi;

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
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      domainName: { domainName: props.domainName, certificate },
      disableExecuteApiEndpoint: true,
      defaultMethodOptions: { apiKeyRequired: true },
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogs),
        accessLogFormat,
      },
    });
    this.api = api;
    api.node.tryRemoveChild(DISABLED_EXECUTE_API_URL_OUTPUT);
    // API Gateway responde 403 «Missing Authentication Token» a una ruta que no
    // existe; un 404 dice lo que pasa.
    api.addGatewayResponse("UnknownRoute", {
      type: apigateway.ResponseType.MISSING_AUTHENTICATION_TOKEN,
      statusCode: "404",
      templates: { "application/json": UNKNOWN_ROUTE_BODY },
    });

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
