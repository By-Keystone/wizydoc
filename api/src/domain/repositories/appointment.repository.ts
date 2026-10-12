import type { Appointment } from "@/domain/entities/appointment/entity";

export interface IAppointmentRepository {
  findByAccessToken(token: string): Promise<Appointment | null>;
  findById(id: string): Promise<Appointment | null>;
  issueAccessToken(appointmentId: string): Promise<string>;
  cancel(
    appointment: Appointment,
    now: Date,
    onlyIfNotMoved: boolean,
  ): Promise<boolean>;
  reschedule(appointment: Appointment, scheduledAt: Date): Promise<boolean>;
}
