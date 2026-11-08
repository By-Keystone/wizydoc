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

type TableWrites = Partial<
  Record<
    "dynamodb:PutItem" | "dynamodb:UpdateItem" | "dynamodb:DeleteItem",
    string[]
  >
>;

const EMAIL_SEND_ATTEMPTS_KEYS = "EMAIL_SEND_ATTEMPTS#*";

const SIGN_UP_WRITES: TableWrites = {
  "dynamodb:PutItem": ["USER#*", "EMAIL_CONFIRMATION#*"],
  "dynamodb:UpdateItem": [EMAIL_SEND_ATTEMPTS_KEYS],
};
const RESEND_CONFIRMATION_WRITES: TableWrites = {
  "dynamodb:PutItem": ["EMAIL_CONFIRMATION#*"],
  "dynamodb:UpdateItem": [EMAIL_SEND_ATTEMPTS_KEYS],
};
const REQUEST_SIGN_UP_CODE_WRITES: TableWrites = {
  "dynamodb:PutItem": ["SIGN_UP_CODE#*", "SIGN_UP_NOTICE#*"],
  "dynamodb:UpdateItem": [EMAIL_SEND_ATTEMPTS_KEYS],
};
const VERIFY_SIGN_UP_CODE_WRITES: TableWrites = {
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

    const temporaryHandler = new lambda.Function(this, "TemporaryHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromInline(HEALTH_RESPONSE_HANDLER),
    });

    const apiGateway = new ApiGateway(this, "ApiGateway", {
      handler: temporaryHandler,
      hostedZone,
      domainName: props.apiDomainName,
    });

    const authentication = new Authentication(this, "Authentication");
    const database = new DynamoTables(this, "Database");
    const emailTemplates = new SignUpEmailTemplates(
      this,
      "SignUpEmailTemplates",
    );

    const sharedEnvironment = {
      TABLE_NAME: database.table.tableName,
      FRONTEND_URL: props.frontendUrl,
      EMAIL_FROM: props.emailFrom,
      CONFIRM_EMAIL_TEMPLATE: emailTemplates.confirmEmail.name,
      PENDING_CONFIRMATION_TEMPLATE: emailTemplates.pendingConfirmation.name,
      ACCOUNT_EXISTS_TEMPLATE: emailTemplates.accountExists.name,
      SIGN_UP_CODE_TEMPLATE: emailTemplates.signUpCode.name,
    };
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

    const signUpFunction = this.usersFunction("SignUpFunction", "sign-up", {
      ...sharedEnvironment,
      USER_POOL_ID: authentication.userPool.userPoolId,
      TERMS_ACCEPTANCE_REQUIRED: String(props.termsAcceptanceRequired),
    });
    grantTableWrites(signUpFunction, database.table, SIGN_UP_WRITES);
    grantUserEmailLookup(signUpFunction, database.table);
    authentication.userPool.grant(
      signUpFunction,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminDeleteUser",
    );
    signUpFunction.addToRolePolicy(
      sendEmailWithTemplates([
        emailTemplates.confirmEmail,
        emailTemplates.pendingConfirmation,
        emailTemplates.accountExists,
      ]),
    );
    signUpFunction.node.addDependency(emailTemplates);

    const resendConfirmationFunction = this.usersFunction(
      "ResendConfirmationFunction",
      "resend-confirmation",
      sharedEnvironment,
    );
    grantTableWrites(
      resendConfirmationFunction,
      database.table,
      RESEND_CONFIRMATION_WRITES,
    );
    grantUserEmailLookup(resendConfirmationFunction, database.table);
    resendConfirmationFunction.addToRolePolicy(
      sendEmailWithTemplates([emailTemplates.confirmEmail]),
    );
    resendConfirmationFunction.node.addDependency(emailTemplates);

    const requestSignUpCodeFunction = this.usersFunction(
      "RequestSignUpCodeFunction",
      "request-sign-up-code",
      sharedEnvironment,
    );
    grantTableWrites(
      requestSignUpCodeFunction,
      database.table,
      REQUEST_SIGN_UP_CODE_WRITES,
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
    grantTableWrites(
      verifySignUpCodeFunction,
      database.table,
      VERIFY_SIGN_UP_CODE_WRITES,
    );

    const signUpResource =
      apiGateway.api.root.resourceForPath("api/auth/sign-up");
    signUpResource
      .addResource("email")
      .addMethod("POST", new apigateway.LambdaIntegration(signUpFunction));
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
      .addResource("resend-confirmation")
      .addMethod(
        "POST",
        new apigateway.LambdaIntegration(resendConfirmationFunction),
      );
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

const grantTableWrites = (
  usersFunction: NodejsFunction,
  table: ITableV2,
  writes: TableWrites,
) => {
  for (const [action, keyPrefixes] of Object.entries(writes)) {
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
