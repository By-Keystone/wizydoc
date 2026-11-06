import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  type CognitoIdentityProviderClient,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  CreateUserIfAbsentInput,
  IIdentityProvider,
} from "../../../application/ports/identity-provider.port";
import type { EmailVO } from "../../../domain/value-objects/email.vo";

export class CognitoIdentityProvider implements IIdentityProvider {
  constructor(
    private readonly cognitoClient: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}

  async createUserIfAbsent(
    input: CreateUserIfAbsentInput,
  ): Promise<string | undefined> {
    const cognitoSub = await this.createWithoutPassword(input.email);
    if (!cognitoSub) return undefined;

    await this.setPasswordOrDelete(cognitoSub, input.password);
    return cognitoSub;
  }

  async deleteUser(cognitoSub: string): Promise<void> {
    await this.cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: cognitoSub,
      }),
    );
  }

  private async createWithoutPassword(
    email: EmailVO,
  ): Promise<string | undefined> {
    try {
      const { User } = await this.cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          UserAttributes: [{ Name: "email", Value: email }],
          MessageAction: "SUPPRESS",
        }),
      );
      const cognitoSub = User?.Attributes?.find(
        (attribute) => attribute.Name === "sub",
      )?.Value;
      if (!cognitoSub) {
        throw new Error("Cognito no devolvió el sub del usuario creado.");
      }
      return cognitoSub;
    } catch (error) {
      if (error instanceof UsernameExistsException) return undefined;
      throw error;
    }
  }

  private async setPasswordOrDelete(
    cognitoSub: string,
    password: string,
  ): Promise<void> {
    try {
      await this.cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: this.userPoolId,
          Username: cognitoSub,
          Password: password,
          Permanent: true,
        }),
      );
    } catch (error) {
      await this.deleteUser(cognitoSub);
      throw error;
    }
  }
}
