import type { AppointmentNotice } from "@/application/queries/appointment/get-appointment-notice.query";

export interface RescheduleNotice {
  notice: AppointmentNotice;
  previousScheduledAt: Date;
  token: string;
}

export interface IAppointmentNotifier {
  notifyCancelled(notice: AppointmentNotice): Promise<void>;
  notifyRescheduled(reschedule: RescheduleNotice): Promise<void>;
}
