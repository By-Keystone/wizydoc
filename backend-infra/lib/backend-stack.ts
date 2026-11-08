import * as path from "node:path";
import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import type { ITableV2 } from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import { ApiGateway } from "./api-gateway";
import { Authentication } from "./authentication";
import { DynamoTables } from "./dynamo";
import { senderAddressOf } from "./sender-address";
import {
  type SignUpEmailTemplate,
  SignUpEmailTemplates,
} from "./sign-up-email-templates";

const HEALTH_RESPONSE_HANDLER = `
exports.handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "ok" }),
});
`;

const USERS_HANDLERS_DIRECTORY = path.join(__dirname, "src/users/handlers");
const USERS_FUNCTION_TIMEOUT = Duration.seconds(15);
const USERS_FUNCTION_MEMORY_MB = 512;
const USER_EMAIL_INDEX = "GSI1";

type TableAccess = Partial<
  Record<
    | "dynamodb:GetItem"
    | "dynamodb:PutItem"
    | "dynamodb:UpdateItem"
    | "dynamodb:DeleteItem",
    string[]
  >
>;

const REQUEST_SIGN_UP_CODE_ACCESS: TableAccess = {
  "dynamodb:PutItem": ["SIGN_UP_CODE#*", "SIGN_UP_NOTICE#*"],
  "dynamodb:UpdateItem": ["EMAIL_SEND_ATTEMPTS#*"],
};
const CONFIRM_SIGN_UP_ACCESS: TableAccess = {
  "dynamodb:GetItem": ["SIGN_UP_VERIFICATION#*"],
  "dynamodb:PutItem": ["USER#*"],
  "dynamodb:DeleteItem": ["SIGN_UP_VERIFICATION#*"],
};
const VERIFY_SIGN_UP_CODE_ACCESS: TableAccess = {
  "dynamodb:PutItem": ["SIGN_UP_VERIFICATION#*"],
  "dynamodb:UpdateItem": ["SIGN_UP_CODE#*", "SIGN_UP_VERIFY_ATTEMPTS#*"],
  "dynamodb:DeleteItem": ["SIGN_UP_CODE#*"],
};

export interface BackendStackProps extends StackProps {
  hostedZoneId: string;
  zoneName: string;
  apiDomainName: string;
  frontendUrl: string;
  emailFrom: string;
  termsAcceptanceRequired: boolean;
}

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      { hostedZoneId: props.hostedZoneId, zoneName: props.zoneName },
    );

    const healthFunction = new lambda.Function(this, "HealthFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromInline(HEALTH_RESPONSE_HANDLER),
    });

    const apiGateway = new ApiGateway(this, "ApiGateway", {
      hostedZone,
      domainName: props.apiDomainName,
    });

    const authentication = new Authentication(this, "Authentication");
    const database = new DynamoTables(this, "Database");
    const emailTemplates = new SignUpEmailTemplates(
      this,
      "SignUpEmailTemplates",
    );

    // SES autoriza el envío con plantilla como `ses:SendTemplatedEmail`, y en el
    // sandbox también sobre la identidad del destinatario: por eso
    // `identity/*`, y la condición acota el remitente.
    const anyIdentity = this.formatArn({
      service: "ses",
      resource: "identity",
      resourceName: "*",
    });
    const sendEmailWithTemplates = (templates: SignUpEmailTemplate[]) =>
      new iam.PolicyStatement({
        actions: ["ses:SendTemplatedEmail"],
        resources: [anyIdentity, ...templates.map(({ arn }) => arn)],
        conditions: {
          StringEquals: { "ses:FromAddress": senderAddressOf(props.emailFrom) },
        },
      });

    const requestSignUpCodeFunction = this.usersFunction(
      "RequestSignUpCodeFunction",
      "request-sign-up-code",
      {
        TABLE_NAME: database.table.tableName,
        FRONTEND_URL: props.frontendUrl,
        EMAIL_FROM: props.emailFrom,
        ACCOUNT_EXISTS_TEMPLATE: emailTemplates.accountExists.name,
        SIGN_UP_CODE_TEMPLATE: emailTemplates.signUpCode.name,
      },
    );
    grantTableAccess(
      requestSignUpCodeFunction,
      database.table,
      REQUEST_SIGN_UP_CODE_ACCESS,
    );
    grantUserEmailLookup(requestSignUpCodeFunction, database.table);
    requestSignUpCodeFunction.addToRolePolicy(
      sendEmailWithTemplates([
        emailTemplates.signUpCode,
        emailTemplates.accountExists,
      ]),
    );
    requestSignUpCodeFunction.node.addDependency(emailTemplates);

    const verifySignUpCodeFunction = this.usersFunction(
      "VerifySignUpCodeFunction",
      "verify-sign-up-code",
      { TABLE_NAME: database.table.tableName },
    );
    grantTableAccess(
      verifySignUpCodeFunction,
      database.table,
      VERIFY_SIGN_UP_CODE_ACCESS,
    );

    const confirmSignUpFunction = this.usersFunction(
      "ConfirmSignUpFunction",
      "confirm-sign-up",
      {
        TABLE_NAME: database.table.tableName,
        USER_POOL_ID: authentication.userPool.userPoolId,
        PLATFORM_CLIENT_ID: authentication.platformClient.userPoolClientId,
        TERMS_ACCEPTANCE_REQUIRED: String(props.termsAcceptanceRequired),
      },
    );
    grantTableAccess(
      confirmSignUpFunction,
      database.table,
      CONFIRM_SIGN_UP_ACCESS,
    );
    grantUserEmailLookup(confirmSignUpFunction, database.table);
    authentication.userPool.grant(
      confirmSignUpFunction,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminInitiateAuth",
      "cognito-idp:DescribeUserPoolClient",
    );

    const signUpResource =
      apiGateway.api.root.resourceForPath("api/auth/sign-up");
    const signUpCodeResource = signUpResource.addResource("code");
    signUpCodeResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(requestSignUpCodeFunction),
    );
    signUpCodeResource
      .addResource("verify")
      .addMethod(
        "POST",
        new apigateway.LambdaIntegration(verifySignUpCodeFunction),
      );
    signUpResource
      .addResource("confirm")
      .addMethod(
        "POST",
        new apigateway.LambdaIntegration(confirmSignUpFunction),
      );
    apiGateway.api.root
      .addResource("health")
      .addMethod("GET", new apigateway.LambdaIntegration(healthFunction));
  }

  private usersFunction(
    id: string,
    handlerName: string,
    environment: Record<string, string>,
  ): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(USERS_HANDLERS_DIRECTORY, `${handlerName}.handler.ts`),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: USERS_FUNCTION_TIMEOUT,
      memorySize: USERS_FUNCTION_MEMORY_MB,
      environment: {
        ...environment,
        NODE_OPTIONS: "--enable-source-maps",
      },
      logGroup: new logs.LogGroup(this, `${id}Logs`, {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      bundling: { minify: true, sourceMap: true },
    });
  }
}

const grantTableAccess = (
  usersFunction: NodejsFunction,
  table: ITableV2,
  access: TableAccess,
) => {
  for (const [action, keyPrefixes] of Object.entries(access)) {
    usersFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [action],
        resources: [table.tableArn],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": keyPrefixes },
        },
      }),
    );
  }
};

const grantUserEmailLookup = (usersFunction: NodejsFunction, table: ITableV2) =>
  usersFunction.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ["dynamodb:Query"],
      resources: [`${table.tableArn}/index/${USER_EMAIL_INDEX}`],
    }),
  );
