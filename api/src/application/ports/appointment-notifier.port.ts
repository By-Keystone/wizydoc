import type { ManagedAppointmentRecord } from "@/domain/entities/appointment/self-service";

export interface RescheduleNotice {
  appointment: ManagedAppointmentRecord;
  previousScheduledAt: Date;
  token: string;
}

export interface IAppointmentNotifier {
  notifyCancelled(appointment: ManagedAppointmentRecord): Promise<void>;
  notifyRescheduled(notice: RescheduleNotice): Promise<void>;
}
