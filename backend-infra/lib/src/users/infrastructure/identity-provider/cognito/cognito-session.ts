import { createHmac } from "node:crypto";
import {
  AdminInitiateAuthCommand,
  type CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  ISessionProvider,
  Session,
  StartSessionInput,
} from "../../../application/ports/session-provider.port";

export interface CognitoSessionSettings {
  userPoolId: string;
  clientId: string;
}

export class CognitoSessionProvider implements ISessionProvider {
  private clientSecret: string | undefined;

  constructor(
    private readonly cognitoClient: CognitoIdentityProviderClient,
    private readonly settings: CognitoSessionSettings,
  ) {}

  async start({ cognitoSub, password }: StartSessionInput): Promise<Session> {
    const { AuthenticationResult } = await this.cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: this.settings.userPoolId,
        ClientId: this.settings.clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: cognitoSub,
          PASSWORD: password,
          SECRET_HASH: await this.secretHash(cognitoSub),
        },
      }),
    );

    const { IdToken, AccessToken, RefreshToken, ExpiresIn } =
      AuthenticationResult ?? {};
    if (!IdToken || !AccessToken || !RefreshToken || !ExpiresIn) {
      throw new Error("Cognito no devolvió los tokens de la sesión.");
    }
    return {
      idToken: IdToken,
      accessToken: AccessToken,
      refreshToken: RefreshToken,
      expiresIn: ExpiresIn,
    };
  }

  private async secretHash(username: string): Promise<string> {
    const clientSecret = await this.readClientSecret();
    return createHmac("sha256", clientSecret)
      .update(username + this.settings.clientId)
      .digest("base64");
  }

  private async readClientSecret(): Promise<string> {
    if (this.clientSecret) return this.clientSecret;

    const { UserPoolClient } = await this.cognitoClient.send(
      new DescribeUserPoolClientCommand({
        UserPoolId: this.settings.userPoolId,
        ClientId: this.settings.clientId,
      }),
    );
    if (!UserPoolClient?.ClientSecret) {
      throw new Error("El cliente de platform no tiene secreto.");
    }
    this.clientSecret = UserPoolClient.ClientSecret;
    return this.clientSecret;
  }
}
