export interface IEmailSendAttempts {
  tryRegister(ipAddress: string | undefined): Promise<boolean>;
}
