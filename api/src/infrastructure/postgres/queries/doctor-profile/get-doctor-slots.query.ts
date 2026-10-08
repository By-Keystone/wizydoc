import type {
  DoctorSlots,
  GetDoctorSlotsDto,
  IGetDoctorSlotsQuery,
} from "@/application/queries/doctor-profile/get-doctor-slots.query";
import { SLOT_DURATION_MINUTES } from "@/domain/entities/availability/entity";
import {
  addDays,
  startOfDay,
  toInstant,
  toWallTime,
} from "@/domain/services/clinic-time";
import { getClient } from "../../transaction-context";

/**
 * Una cita ocupa el hueco salvo que se haya cancelado o el paciente no se haya
 * presentado: en esos dos casos vuelve a estar libre.
 */
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"] as const;

/** `"09:00"` → minutos desde medianoche. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutos desde medianoche → `"09:00"`. */
function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export class GetDoctorSlotsQuery implements IGetDoctorSlotsQuery {
  async execute(dto: GetDoctorSlotsDto): Promise<DoctorSlots> {
    const client = getClient();

    // El rango que pide el cliente son días de la clínica, así que sus límites
    // se traducen a los instantes en que empiezan aquí.
    const from = startOfDay(dto.from);
    const to = startOfDay(addDays(dto.to, 1));

    const isBookable = await this.isBookable(dto.doctorProfileId);

    const [availabilities, appointments] = isBookable
      ? await Promise.all([
          client.availability.findMany({
            where: { doctorProfileId: dto.doctorProfileId },
            select: { dayOfWeek: true, startTime: true, endTime: true },
          }),
          client.appointment.findMany({
            where: {
              doctorProfileId: dto.doctorProfileId,
              scheduledAt: { gte: from, lt: to },
              status: { in: [...BLOCKING_STATUSES] },
            },
            select: { scheduledAt: true },
          }),
        ])
      : [[], []];

    // Cada cita se lleva a la hora de reloj de la clínica para poder cruzarla
    // con los horarios del doctor, que están en esa misma referencia.
    const taken = new Set(
      appointments.map((appointment) => {
        const wall = toWallTime(appointment.scheduledAt);
        return `${wall.date} ${wall.time}`;
      }),
    );

    const now = Date.now();
    const days: Record<string, string[]> = {};

    for (let date = dto.from; date <= dto.to; date = addDays(date, 1)) {
      const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
      const slots = new Set<string>();

      for (const availability of availabilities) {
        if (availability.dayOfWeek !== dayOfWeek) continue;

        const end = toMinutes(availability.endTime);

        for (
          let minute = toMinutes(availability.startTime);
          minute + SLOT_DURATION_MINUTES <= end;
          minute += SLOT_DURATION_MINUTES
        ) {
          const time = toTime(minute);

          if (taken.has(`${date} ${time}`)) continue;
          // Comparación entre instantes: la hora de reloj se convierte al
          // momento real en que ocurre antes de mirar si ya pasó.
          if (toInstant(date, time).getTime() <= now) continue;

          slots.add(time);
        }
      }

      days[date] = [...slots].sort();
    }

    return { durationMinutes: SLOT_DURATION_MINUTES, days };
  }

  private async isBookable(doctorProfileId: string): Promise<boolean> {
    const client = getClient();

    const profile = await client.doctorProfile.findUnique({
      where: { id: doctorProfileId },
      select: { userId: true, clinicId: true },
    });
    if (!profile) return false;

    const membership = await client.userResourceMembership.findUnique({
      where: {
        userId_resourceId: {
          userId: profile.userId,
          resourceId: profile.clinicId,
        },
        deletedAt: null,
      },
      select: { id: true },
    });

    return membership !== null;
  }
}
