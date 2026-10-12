import { toWallTime } from "@/domain/services/clinic-time";

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export const RESCHEDULE_DEADLINE_HOURS = 12;
export const MAX_RESCHEDULES = 3;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// Debe coincidir con el predicado del índice appointment_doctor_slot_active_key.
export const BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
];

export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "PENDING",
  "CONFIRMED",
];

export type RescheduleBlock = "DEADLINE" | "LIMIT";

export interface Appointment {
  id: string;
  clinicId: string;
  doctorProfileId: string;
  specialty: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  rescheduleCount: number;
}

type Schedule = Pick<Appointment, "scheduledAt" | "rescheduleCount">;

function hasStarted(
  appointment: Pick<Appointment, "scheduledAt">,
  now: Date,
): boolean {
  return appointment.scheduledAt.getTime() <= now.getTime();
}

export function isCancelled(appointment: Pick<Appointment, "status">): boolean {
  return appointment.status === "CANCELLED";
}

function isActive(appointment: Pick<Appointment, "status">): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status);
}

export function isManageable(appointment: Appointment, now: Date): boolean {
  return (
    !hasStarted(appointment, now) &&
    (isActive(appointment) || isCancelled(appointment))
  );
}

export function rescheduleBlockedBy(
  appointment: Schedule,
  now: Date,
): RescheduleBlock | null {
  const hoursLeft =
    (appointment.scheduledAt.getTime() - now.getTime()) / MILLISECONDS_PER_HOUR;

  if (hoursLeft < RESCHEDULE_DEADLINE_HOURS) return "DEADLINE";
  if (appointment.rescheduleCount >= MAX_RESCHEDULES) return "LIMIT";
  return null;
}

/** `expectedScheduledAt` es la hora de pared (`"2026-08-06T09:00"`) que el paciente vio en pantalla. */
export function hasMovedFrom(
  appointment: Pick<Appointment, "scheduledAt">,
  expectedScheduledAt: string,
): boolean {
  const { date, time } = toWallTime(appointment.scheduledAt);
  return `${date}T${time}` !== expectedScheduledAt;
}
