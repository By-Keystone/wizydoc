import type { EmailVO } from "../../domain/value-objects/email.vo";

export interface CreateUserIfAbsentInput {
  email: EmailVO;
  password: string;
}

export interface IIdentityProvider {
  createUserIfAbsent(
    input: CreateUserIfAbsentInput,
  ): Promise<string | undefined>;
  deleteUser(cognitoSub: string): Promise<void>;
}
