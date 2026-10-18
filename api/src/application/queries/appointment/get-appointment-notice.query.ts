export interface DoctorContact {
  email: string;
  firstName: string;
  displayName: string;
}

export interface AppointmentNotice {
  patientEmail: string;
  patientName: string;
  patientLastName: string;
  doctor: DoctorContact;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  accountId: string;
  specialty: string;
  scheduledAt: Date;
  durationMinutes: number;
}

export interface IGetAppointmentNoticeQuery {
  execute(appointmentId: string): Promise<AppointmentNotice | null>;
  findDoctor(doctorProfileId: string): Promise<DoctorContact | null>;
}
