import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

const MINIMUM_PASSWORD_LENGTH = 8;

export class Authentication extends Construct {
  readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: false },
      standardAttributes: { email: { required: true, mutable: true } },
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
    });
  }
}
