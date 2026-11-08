import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

const PLATFORM_REQUESTS_PER_SECOND = 100;
const PLATFORM_BURST_REQUESTS = 200;

const DISABLED_EXECUTE_API_URL_OUTPUT = "Endpoint";
const UNKNOWN_ROUTE_BODY = JSON.stringify({ message: "Not found" });

const STAGE_REVIEW_TIMEOUT = Duration.seconds(30);
const RESOURCES_PER_PAGE = 500;

const REDEPLOY_STALE_STAGE_HANDLER = `
const {
  APIGatewayClient,
  CreateDeploymentCommand,
  GetDeploymentCommand,
  GetResourcesCommand,
  GetStageCommand,
} = require("@aws-sdk/client-api-gateway");

const client = new APIGatewayClient({});
const restApiId = process.env.REST_API_ID;
const stageName = process.env.STAGE_NAME;

const routesOf = (methodsByPath) =>
  JSON.stringify(
    Object.entries(methodsByPath)
      .flatMap(([path, methods]) =>
        Object.keys(methods ?? {}).map((method) => method + " " + path),
      )
      .sort(),
  );

const currentMethodsByPath = async () => {
  const methodsByPath = {};
  let position;
  do {
    const page = await client.send(
      new GetResourcesCommand({
        restApiId,
        embed: ["methods"],
        limit: ${RESOURCES_PER_PAGE},
        position,
      }),
    );
    for (const resource of page.items ?? []) {
      methodsByPath[resource.path] = resource.resourceMethods;
    }
    position = page.position;
  } while (position);
  return methodsByPath;
};

exports.handler = async () => {
  const { deploymentId } = await client.send(
    new GetStageCommand({ restApiId, stageName }),
  );
  const { apiSummary } = await client.send(
    new GetDeploymentCommand({ restApiId, deploymentId, embed: ["apisummary"] }),
  );
  const publishedRoutes = routesOf(apiSummary ?? {});
  if (publishedRoutes === routesOf(await currentMethodsByPath())) return;

  await client.send(new CreateDeploymentCommand({ restApiId, stageName }));
  console.log("[stage] se volvió a publicar la etapa sin las rutas quitadas", {
    previousDeploymentId: deploymentId,
  });
};
`;

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

    this.redeployStageWhenRoutesAreRemoved(api);
  }

  // CloudFormation crea el deployment nuevo antes de borrar las rutas quitadas,
  // que se borran en la limpieza: la etapa las seguiría publicando, contra
  // Lambdas que ya no existen. Por eso se revisa la etapa al terminar el stack.
  private redeployStageWhenRoutesAreRemoved(api: apigateway.RestApi) {
    const stack = Stack.of(this);
    const restApiArn = (resourcePath: string) =>
      stack.formatArn({
        service: "apigateway",
        account: "",
        resource: "/restapis",
        resourceName: `${api.restApiId}/${resourcePath}`,
      });

    const redeployFunction = new lambda.Function(
      this,
      "RedeployStaleStageFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: "index.handler",
        code: lambda.Code.fromInline(REDEPLOY_STALE_STAGE_HANDLER),
        timeout: STAGE_REVIEW_TIMEOUT,
        environment: {
          REST_API_ID: api.restApiId,
          STAGE_NAME: api.deploymentStage.stageName,
        },
        logGroup: new logs.LogGroup(this, "RedeployStaleStageLogs", {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
      },
    );
    redeployFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["apigateway:GET"],
        resources: [restApiArn("*")],
      }),
    );
    redeployFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["apigateway:POST"],
        resources: [restApiArn("deployments")],
      }),
    );

    new events.Rule(this, "StackUpdateComplete", {
      eventPattern: {
        source: ["aws.cloudformation"],
        detailType: ["CloudFormation Stack Status Change"],
        detail: {
          "stack-id": [stack.stackId],
          "status-details": { status: ["UPDATE_COMPLETE"] },
        },
      },
      targets: [new eventsTargets.LambdaFunction(redeployFunction)],
    });
  }
}
