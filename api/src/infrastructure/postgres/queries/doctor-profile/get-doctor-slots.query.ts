import {
  daysInclusive,
  type DoctorSlots,
  type GetDoctorSlotsDto,
  type IGetDoctorSlotsQuery,
} from "@/application/queries/doctor-profile/get-doctor-slots.query";
import { SLOT_DURATION_MINUTES } from "@/domain/entities/availability/entity";
import {
  addDays,
  startOfDay,
  today,
  toWallTime,
} from "@/domain/services/clinic-time";
import { getClient } from "../../transaction-context";

/**
 * Una cita ocupa el hueco salvo que se haya cancelado o el paciente no se haya
 * presentado: en esos dos casos vuelve a estar libre.
 */
const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"] as const;

const STRICT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const END_OF_DAY = "24:00";
const MINUTES_PER_DAY = 24 * 60;

/** `"09:00"` → minutos desde medianoche; `null` si el dato guardado no es una hora válida. */
function toMinutes(time: string, allowEndOfDay = false): number | null {
  if (allowEndOfDay && time === END_OF_DAY) return MINUTES_PER_DAY;

  const match = STRICT_TIME_PATTERN.exec(time);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
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

    const todayKey = today();
    const nowTime = toWallTime(new Date()).time;
    const days: Record<string, string[]> = {};
    const dayCount = daysInclusive(dto.from, dto.to);

    for (let offset = 0; offset < dayCount; offset++) {
      const date = addDays(dto.from, offset);
      const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
      const slots = new Set<string>();

      if (date < todayKey) {
        days[date] = [];
        continue;
      }

      for (const availability of availabilities) {
        if (availability.dayOfWeek !== dayOfWeek) continue;

        const start = toMinutes(availability.startTime);
        const end = toMinutes(availability.endTime, true);
        if (start === null || end === null || start >= end) continue;

        for (
          let minute = start;
          minute + SLOT_DURATION_MINUTES <= end;
          minute += SLOT_DURATION_MINUTES
        ) {
          const time = toTime(minute);

          if (taken.has(`${date} ${time}`)) continue;
          if (date === todayKey && time <= nowTime) continue;

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
