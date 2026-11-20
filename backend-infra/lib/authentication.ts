import { Duration } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

const MINIMUM_PASSWORD_LENGTH = 8;
const TOKEN_VALIDITY = Duration.minutes(15);
const REFRESH_TOKEN_VALIDITY = Duration.days(15);
export const PLATFORM_CLIENT_NAME = "wizydoc-platform";

const writableAttributes =
  new cognito.ClientAttributes().withStandardAttributes({ email: true });

export class Authentication extends Construct {
  readonly userPool: cognito.UserPool;
  readonly platformClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "UserPoolWithImmutableEmail", {
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: false },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: {
        minLength: MINIMUM_PASSWORD_LENGTH,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.NONE,
    });

    this.platformClient = this.userPool.addClient("PlatformClient", {
      userPoolClientName: PLATFORM_CLIENT_NAME,
      generateSecret: true,
      authFlows: { adminUserPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      writeAttributes: writableAttributes,
      idTokenValidity: TOKEN_VALIDITY,
      accessTokenValidity: TOKEN_VALIDITY,
      refreshTokenValidity: REFRESH_TOKEN_VALIDITY,
    });
  }
}
