export interface StartSessionInput {
  cognitoSub: string;
  password: string;
}

export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ISessionProvider {
  start(input: StartSessionInput): Promise<Session>;
}
