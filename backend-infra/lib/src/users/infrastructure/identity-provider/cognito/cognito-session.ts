import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  AdminInitiateAuthCommand,
  type CognitoIdentityProviderClient,
  DescribeUserPoolClientCommand,
  NotAuthorizedException,
  RevokeTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  ISessionProvider,
  Session,
  SignInAttempt,
  SignInCredentials,
  StartSessionInput,
} from "../../../application/ports/session-provider.port";

export interface CognitoSessionSettings {
  userPoolId: string;
  clientId: string;
}

const LOCKED_OUT_MESSAGE = "Password attempts exceeded";
const REJECTION_MESSAGES = [
  "Incorrect username or password.",
  "User is disabled.",
];

const idTokenPayloadSchema = z.object({ sub: z.string().min(1) });

// Sin verificar la firma: el token llega en la respuesta a nuestra llamada firmada con SigV4, no de platform.
const readSubject = (idToken: string): string => {
  const [, payload = ""] = idToken.split(".");
  return idTokenPayloadSchema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString()),
  ).sub;
};

export class CognitoSessionProvider implements ISessionProvider {
  private clientSecret: string | undefined;

  constructor(
    private readonly cognitoClient: CognitoIdentityProviderClient,
    private readonly settings: CognitoSessionSettings,
  ) {}

  start({ cognitoSub, password }: StartSessionInput): Promise<Session> {
    return this.authenticate(cognitoSub, password);
  }

  async signIn({ email, password }: SignInCredentials): Promise<SignInAttempt> {
    await this.readClientSecret();
    try {
      const session = await this.authenticate(email, password);
      return {
        kind: "accepted",
        cognitoSub: readSubject(session.idToken),
        session,
      };
    } catch (error) {
      if (!(error instanceof NotAuthorizedException)) throw error;
      if (error.message === LOCKED_OUT_MESSAGE) return { kind: "locked-out" };
      if (!REJECTION_MESSAGES.includes(error.message)) {
        console.warn("[sign-in] NotAuthorizedException inesperado");
      }
      return { kind: "rejected" };
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.cognitoClient.send(
      new RevokeTokenCommand({
        ClientId: this.settings.clientId,
        ClientSecret: await this.readClientSecret(),
        Token: refreshToken,
      }),
    );
  }

  private async authenticate(
    username: string,
    password: string,
  ): Promise<Session> {
    const { AuthenticationResult } = await this.cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: this.settings.userPoolId,
        ClientId: this.settings.clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
          SECRET_HASH: await this.secretHash(username),
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
