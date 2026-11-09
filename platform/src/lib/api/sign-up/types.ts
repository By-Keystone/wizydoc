export interface ConfirmSignUpInput {
  email: string;
  password: string;
  verificationToken: string;
}

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
