import { Stack, type StackProps } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import { ApiGateway } from "./api-gateway";
import { Authentication } from "./authentication";

const HEALTH_RESPONSE_HANDLER = `
exports.handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "ok" }),
});
`;

export interface BackendStackProps extends StackProps {
  hostedZoneId: string;
  zoneName: string;
  apiDomainName: string;
}

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      { hostedZoneId: props.hostedZoneId, zoneName: props.zoneName },
    );

    const temporaryHandler = new lambda.Function(this, "TemporaryHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromInline(HEALTH_RESPONSE_HANDLER),
    });

    new ApiGateway(this, "ApiGateway", {
      handler: temporaryHandler,
      hostedZone,
      domainName: props.apiDomainName,
    });

    new Authentication(this, "Authentication");
  }
}
