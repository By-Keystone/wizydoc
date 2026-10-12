export interface AppointmentNotice {
  id: string;
  clinicId: string;
  doctorProfileId: string;
  specialty: string;
  scheduledAt: Date;
  patient: { name: string; email: string };
  clinic: { name: string; address: string };
  doctor: { name: string; lastName: string; email: string };
}

export interface IGetAppointmentNoticeQuery {
  execute(appointmentId: string): Promise<AppointmentNotice>;
}
