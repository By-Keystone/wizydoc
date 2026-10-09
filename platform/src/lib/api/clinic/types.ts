export type Clinic = {
  id: string; // The resource id
  name: string;
  address: string;
  phone: string;
};

export type ClinicWithUser = Clinic & {
  createdBy: {
    name: string;
    lastName: string;
    email: string;
  };
};

export type ClinicUser = {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
};

export type ClinicMetrics = {
  appointments: number;
  doctors?: number;
  memberships?: number;
};

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

/**
 * Cita de la agenda del día. Un DOCTOR sólo recibe las suyas; el resto de
 * miembros, las de toda la clínica.
 */
export type ClinicAppointment = {
  id: string;
  scheduledAt: string; // ISO en UTC
  /** Hora de reloj de la clínica ("09:00"), ya resuelta por el api. */
  time: string;
  durationMinutes: number;
  status: AppointmentStatus;
  specialty: string;
  patient: {
    name: string;
    lastName: string;
    phone: string;
  };
  doctor: {
    name: string;
    lastName: string;
  };
};
