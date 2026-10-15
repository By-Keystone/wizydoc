export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export const CANCELLATION_REASONS = [
  "UNEXPECTED_EVENT",
  "CANNOT_MAKE_IT",
  "NO_LONGER_NEEDED",
  "SEEN_ELSEWHERE",
  "BOOKED_BY_MISTAKE",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  UNEXPECTED_EVENT: "Me surgió un imprevisto",
  CANNOT_MAKE_IT: "No puedo llegar a esa hora",
  NO_LONGER_NEEDED: "Ya no necesito la cita",
  SEEN_ELSEWHERE: "Me atenderé en otro lugar",
  BOOKED_BY_MISTAKE: "Reservé por error",
};

export const CANCELLATION_NOTICE_HOURS = 12;
export const RESCHEDULE_NOTICE_HOURS = 12;
export const NEW_SLOT_LEAD_HOURS = 12;
export const MAX_RESCHEDULES = 1;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

// Debe coincidir con el predicado del índice appointment_doctor_slot_active_key.
export const BLOCKING_APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
] as const satisfies readonly AppointmentStatus[];

export const ACTIVE_APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
] as const satisfies readonly AppointmentStatus[];

export type RescheduleBlock = "DEADLINE" | "LIMIT";

export interface Appointment {
  id: string;
  clinicId: string;
  doctorProfileId: string;
  patientId: string;
  specialty: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  rescheduleCount: number;
  cancelledAt: Date | null;
  cancellationReason: CancellationReason | null;
  createdAt: Date;
  updatedAt: Date;
}

type AppointmentStatusLike = Pick<Appointment, "status">;
type AppointmentTimingLike = Pick<Appointment, "scheduledAt">;

export function isActive(appointment: AppointmentStatusLike): boolean {
  return (ACTIVE_APPOINTMENT_STATUSES as readonly AppointmentStatus[]).includes(
    appointment.status,
  );
}

export function hasStarted(
  appointment: AppointmentTimingLike,
  now: Date,
): boolean {
  return appointment.scheduledAt.getTime() <= now.getTime();
}

function isAtLeastHoursAway(instant: Date, now: Date, hours: number): boolean {
  return instant.getTime() - now.getTime() >= hours * MILLISECONDS_PER_HOUR;
}

export function isNewSlotFarEnough(slotStart: Date, now: Date): boolean {
  return isAtLeastHoursAway(slotStart, now, NEW_SLOT_LEAD_HOURS);
}

export function canCancel(
  appointment: AppointmentStatusLike & AppointmentTimingLike,
  now: Date,
): boolean {
  return (
    isActive(appointment) &&
    isAtLeastHoursAway(appointment.scheduledAt, now, CANCELLATION_NOTICE_HOURS)
  );
}

export function rescheduleBlockedBy(
  appointment: Pick<Appointment, "scheduledAt" | "rescheduleCount">,
  now: Date,
): RescheduleBlock | null {
  if (
    !isAtLeastHoursAway(appointment.scheduledAt, now, RESCHEDULE_NOTICE_HOURS)
  )
    return "DEADLINE";
  if (appointment.rescheduleCount >= MAX_RESCHEDULES) return "LIMIT";
  return null;
}
