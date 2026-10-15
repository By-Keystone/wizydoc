export interface CancellationNotice {
  patientEmail: string;
  patientName: string;
  doctorEmail: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  accountId: string;
  specialty: string;
  scheduledAt: Date;
}

export interface IGetCancellationNoticeQuery {
  execute(appointmentId: string): Promise<CancellationNotice | null>;
}
