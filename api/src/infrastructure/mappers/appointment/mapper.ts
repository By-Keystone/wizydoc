import type { Appointment } from "@/domain/entities/appointment/entity";
import type { Appointment as PrismaAppointment } from "@prisma/client";

export function toDomain(appointment: PrismaAppointment): Appointment {
  return appointment;
}
