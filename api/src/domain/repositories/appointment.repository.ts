import type { Appointment } from "../entities/appointment/entity";

export interface CancelAppointmentData {
  appointmentId: string;
  cancelledAt: Date;
  expectedScheduledAt?: Date;
}

export interface RescheduleAppointmentData {
  appointmentId: string;
  expectedScheduledAt: Date;
  newScheduledAt: Date;
  newDoctorProfileId?: string;
}

export type RescheduleAppointmentOutcome =
  | "RESCHEDULED"
  | "NOT_UPDATED"
  | "SLOT_TAKEN";

export interface IAppointmentRepository {
  findByAccessToken(token: string): Promise<Appointment | null>;
  issueAccessToken(appointmentId: string): Promise<string>;
  cancel(data: CancelAppointmentData): Promise<boolean>;
  reschedule(
    data: RescheduleAppointmentData,
  ): Promise<RescheduleAppointmentOutcome>;
}
