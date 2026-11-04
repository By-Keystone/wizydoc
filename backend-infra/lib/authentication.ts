import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

const SENDER_LOCAL_PART = "no-reply";
const MINIMUM_PASSWORD_LENGTH = 8;

export interface AuthenticationProps {
  domain: string;
}

export class Authentication extends Construct {
  constructor(scope: Construct, id: string, props: AuthenticationProps) {
    super(scope, id);

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // Sólo el correo: rol y cuenta quedan en la base del api, fuera del alcance del cliente.
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: MINIMUM_PASSWORD_LENGTH,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withSES({
        fromEmail: `${SENDER_LOCAL_PART}@${props.domain}`,
        fromName: "WizyDoc",
        sesVerifiedDomain: props.domain,
      }),
      userVerification: {
        emailSubject: "Tu código de WizyDoc",
        emailBody:
          "Tu código de WizyDoc es {####}. Si no lo pediste, ignora este correo.",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    userPool.addClient("ApiClient", {
      // Sin secreto, cualquiera con el id del cliente podría llamar a SignUp y mandar correos.
      generateSecret: true,
      authFlows: { userPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
    });
  }
}
