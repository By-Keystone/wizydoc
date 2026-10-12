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

export type ManagedAppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export type RescheduleBlock = "DEADLINE" | "LIMIT";

export type ManagedAppointment = {
  status: ManagedAppointmentStatus;
  patientFirstName: string;
  specialty: string;
  doctorName: string; // sin tratamiento; lo antepone la pantalla
  clinicName: string;
  clinicAddress: string;
  clinicId: string;
  doctorProfileId: string;
  date: string; // "YYYY-MM-DD", hora de la clínica
  time: string; // "HH:mm", hora de la clínica
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: RescheduleBlock | null;
};

export type ManagedAppointmentConflict =
  | "SLOT_TAKEN"
  | "RESCHEDULE_NOT_ALLOWED"
  | "APPOINTMENT_CHANGED";
