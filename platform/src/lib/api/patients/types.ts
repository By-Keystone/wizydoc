export type Patient = {
  id: string;
  name: string;
  lastName: string;
  email: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  birthDate: string | null;
};

/** Fechas en ISO: viajan como string por JSON. */
export type PatientMetrics = {
  totalAppointments: number;
  completedCount: number;
  noShowCount: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  nextAppointmentAt: string | null;
};

export type PatientListEntry = Patient & PatientMetrics;

export type PatientRecord = Patient & {
  sex: string | null;
  emergencyContact: string | null;
  insurer: string | null;
  bloodType: string | null;
  allergies: string[];
  background: string | null;
  medications: string | null;
  /**
   * Con fecha, alguien le preguntó al paciente por sus alergias. En `null` la
   * lista vacía solo significa que nadie lo ha preguntado todavía.
   */
  allergiesReviewedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type AppointmentHistoryEntry = {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus;
  specialty: string;
  durationMinutes: number;
  clinicName: string;
  doctorName: string;
};

export type PatientDetail = {
  patient: PatientRecord;
  history: AppointmentHistoryEntry[];
  metrics: PatientMetrics;
};
