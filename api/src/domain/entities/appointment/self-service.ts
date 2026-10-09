import { toInstant, toWallTime } from "@/domain/services/clinic-time";

export type ManagedAppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export const RESCHEDULE_DEADLINE_HOURS = 12;
export const MAX_RESCHEDULES = 3;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// Debe coincidir con el predicado del índice appointment_doctor_slot_active_key.
export const BLOCKING_APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
] as const;

export const ACTIVE_APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;

export type RescheduleBlock = "DEADLINE" | "LIMIT";

interface ReschedulableAppointment {
  scheduledAt: Date;
  rescheduleCount: number;
}

export function hasStarted(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() <= now.getTime();
}

export function rescheduleBlockedBy(
  appointment: ReschedulableAppointment,
  now: Date,
): RescheduleBlock | null {
  const hoursLeft =
    (appointment.scheduledAt.getTime() - now.getTime()) / MILLISECONDS_PER_HOUR;

  if (hoursLeft < RESCHEDULE_DEADLINE_HOURS) return "DEADLINE";
  if (appointment.rescheduleCount >= MAX_RESCHEDULES) return "LIMIT";
  return null;
}

export interface ManagedAppointmentRecord {
  id: string;
  status: ManagedAppointmentStatus;
  scheduledAt: Date;
  durationMinutes: number;
  rescheduleCount: number;
  specialty: string;
  clinicId: string;
  doctorProfileId: string;
  patient: { name: string; email: string };
  clinic: { name: string; address: string };
  doctor: { name: string; lastName: string; email: string };
}

export interface ManagedAppointment {
  status: ManagedAppointmentStatus;
  patientFirstName: string;
  specialty: string;
  doctorName: string;
  clinicName: string;
  clinicAddress: string;
  clinicId: string;
  doctorProfileId: string;
  /** `YYYY-MM-DD`, hora de pared de la clínica. */
  date: string;
  /** `HH:mm`, hora de pared de la clínica. */
  time: string;
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: RescheduleBlock | null;
}

/** Instante → `"2026-08-06T09:00"` (hora de pared de la clínica, a minuto). */
export function wallTimeOfInstant(instant: Date): string {
  const { date, time } = toWallTime(instant);
  return `${date}T${time}`;
}

/** `"2026-08-06T09:00"` (hora de pared de la clínica) → instante. */
export function instantOfWallTime(wallTime: string): Date {
  const [date, time] = wallTime.split("T");
  return toInstant(date, time);
}

export function toManagedAppointment(
  record: ManagedAppointmentRecord,
  now: Date,
): ManagedAppointment {
  const canCancel = record.status !== "CANCELLED";
  const { date, time } = toWallTime(record.scheduledAt);

  return {
    status: record.status,
    patientFirstName: record.patient.name.split(" ")[0],
    specialty: record.specialty,
    doctorName: `${record.doctor.name} ${record.doctor.lastName}`,
    clinicName: record.clinic.name,
    clinicAddress: record.clinic.address,
    clinicId: record.clinicId,
    doctorProfileId: record.doctorProfileId,
    date,
    time,
    durationMinutes: record.durationMinutes,
    canCancel,
    rescheduleBlockedBy: canCancel ? rescheduleBlockedBy(record, now) : null,
  };
}
