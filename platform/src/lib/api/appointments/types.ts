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

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type RescheduleBlock = "DEADLINE" | "LIMIT";

export type AppointmentPortal = {
  status: AppointmentStatus;
  patientName: string;
  specialty: string;
  doctorName: string;
  doctorProfileId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  date: string; // "YYYY-MM-DD", fecha de la clínica
  time: string; // "HH:mm", hora de la clínica
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: RescheduleBlock | null;
};

export type RescheduleAvailability = { hasSlots: boolean };
