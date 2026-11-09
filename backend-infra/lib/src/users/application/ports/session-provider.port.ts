import type { EmailVO } from "../../domain/value-objects/email.vo";

export interface StartSessionInput {
  cognitoSub: string;
  password: string;
}

export interface SignInCredentials {
  email: EmailVO;
  password: string;
}

export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type SignInAttempt =
  | { kind: "accepted"; cognitoSub: string; session: Session }
  | { kind: "rejected" }
  | { kind: "locked-out" };

export interface ISessionProvider {
  start(input: StartSessionInput): Promise<Session>;
  signIn(credentials: SignInCredentials): Promise<SignInAttempt>;
  revoke(refreshToken: string): Promise<void>;
}
