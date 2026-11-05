import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

const MINIMUM_PASSWORD_LENGTH = 8;

export class Authentication extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Cognito sólo autentica: el api crea los usuarios, confirma el correo y recupera la contraseña.
    const userPool = new cognito.UserPool(this, "UserPool", {
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: false },
      // Sólo el correo: rol y cuenta quedan en la base del api, fuera del alcance del cliente.
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

    userPool.addClient("ApiClient", {
      // Sin secreto, cualquiera con el id del cliente podría probar contraseñas contra Cognito sin pasar por el api.
      generateSecret: true,
      authFlows: { userPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });
  }
}
