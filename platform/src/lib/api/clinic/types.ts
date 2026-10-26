import type { AppointmentStatus } from "@/lib/api/appointments/types";
import type { Plan } from "@/lib/plans";

export type Clinic = {
  id: string; // The resource id
  name: string;
  address: string;
  phone: string;
};

export type ClinicLocation = Pick<Clinic, "name" | "address">;

export type BookingStatus = {
  isAcceptingBookings: boolean;
  /** E.164. El api solo lo devuelve con el link cerrado. */
  patientContact: string | null;
};

export type BookingUsage = {
  plan: Plan;
  /** `null` en el plan sin tope. */
  monthlyCap: number | null;
  /** `YYYY-MM`, mes de Lima. */
  month: string;
  /** `YYYY-MM-DD`, primer día del mes siguiente. */
  renewsOn: string;
  bookedThisMonth: number;
  missedThisMonth: number;
  nextPlan: { plan: Plan; monthlyCap: number | null } | null;
  patientContact: string | null;
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

export type ClinicMember = ClinicUser & {
  doctorProfileId: string | null;
  specialties: { id: string; name: string }[];
};

export type ClinicMetrics = {
  appointments: number;
  doctors?: number;
  memberships?: number;
};

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
    displayName: string;
  };
};
