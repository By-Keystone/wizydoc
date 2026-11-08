import { Duration } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

const MINIMUM_PASSWORD_LENGTH = 8;
const REFRESH_TOKEN_VALIDITY = Duration.days(30);

const writableAttributes =
  new cognito.ClientAttributes().withStandardAttributes({
    email: true,
    givenName: true,
    familyName: true,
  });

export class Authentication extends Construct {
  readonly userPool: cognito.UserPool;
  readonly sessionClient: cognito.UserPoolClient;

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

    this.userPool.addClient("ApiClient", {
      generateSecret: true,
      authFlows: { userPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      writeAttributes: writableAttributes,
    });

    this.sessionClient = this.userPool.addClient("SessionClient", {
      userPoolClientName: "session",
      generateSecret: true,
      authFlows: { adminUserPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      writeAttributes: writableAttributes,
      refreshTokenValidity: REFRESH_TOKEN_VALIDITY,
    });
  }
}
