export type CreateAppointmentInput = {
  doctorProfileId: string;
  specialty: string;
  scheduledAt: string; // "YYYY-MM-DDTHH:mm" en hora de la clínica, sin zona
  durationMinutes: number;
  patientName: string;
  patientLastName: string;
  patientPhone: string;
  patientEmail: string;
  patientDocumentType: string;
  patientDocumentNumber: string;
  patientBirthDate: string; // "YYYY-MM-DD", fecha de calendario sin zona
  clinicId: string;
};
