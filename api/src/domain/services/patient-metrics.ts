import { AppointmentStatus } from "@prisma/client";

export interface AppointmentForMetrics {
  scheduledAt: Date;
  status: AppointmentStatus;
}

export interface PatientMetrics {
  totalAppointments: number;
  completedCount: number;
  noShowCount: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
}

const UPCOMING_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

const byDateAscending = (a: Date, b: Date) => a.getTime() - b.getTime();

export function buildPatientMetrics(
  appointments: AppointmentForMetrics[],
  now = new Date(),
): PatientMetrics {
  // Una cita cancelada o a la que no se asistió no es una visita, así que la
  // primera y la última cuentan solo las completadas.
  const visits = appointments
    .filter((appointment) => appointment.status === "COMPLETED")
    .map((appointment) => appointment.scheduledAt)
    .sort(byDateAscending);

  const upcoming = appointments
    .filter(
      (appointment) =>
        UPCOMING_STATUSES.includes(appointment.status) &&
        appointment.scheduledAt > now,
    )
    .map((appointment) => appointment.scheduledAt)
    .sort(byDateAscending);

  return {
    totalAppointments: appointments.length,
    completedCount: visits.length,
    noShowCount: appointments.filter(
      (appointment) => appointment.status === "NO_SHOW",
    ).length,
    firstVisitAt: visits.at(0) ?? null,
    lastVisitAt: visits.at(-1) ?? null,
    nextAppointmentAt: upcoming.at(0) ?? null,
  };
}
