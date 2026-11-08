export interface IIpRateLimit {
  tryRegister(ipAddress: string | undefined): Promise<boolean>;
}
