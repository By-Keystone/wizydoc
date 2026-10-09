export interface IAppointmentAccessTokenRepository {
  issue(appointmentId: string): Promise<string>;
  findAppointmentId(token: string): Promise<string | null>;
}
