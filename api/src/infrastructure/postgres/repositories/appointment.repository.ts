import {
  ACTIVE_APPOINTMENT_STATUSES,
  type Appointment,
  MAX_RESCHEDULES,
} from "@/domain/entities/appointment/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import {
  generateAccessToken,
  hashAccessToken,
  isAccessTokenFormat,
} from "../appointment-access-token";
import { getClient } from "../transaction-context";

const APPOINTMENT_FIELDS = {
  id: true,
  clinicId: true,
  doctorProfileId: true,
  specialty: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  rescheduleCount: true,
} as const;

export class AppointmentRepository implements IAppointmentRepository {
  async findByAccessToken(token: string): Promise<Appointment | null> {
    if (!isAccessTokenFormat(token)) return null;

    return getClient().appointment.findFirst({
      where: { accessTokens: { some: { tokenHash: hashAccessToken(token) } } },
      select: APPOINTMENT_FIELDS,
    });
  }

  async findById(id: string): Promise<Appointment | null> {
    return getClient().appointment.findUnique({
      where: { id },
      select: APPOINTMENT_FIELDS,
    });
  }

  async issueAccessToken(appointmentId: string): Promise<string> {
    const token = generateAccessToken();

    await getClient().appointmentAccessToken.create({
      data: { appointmentId, tokenHash: hashAccessToken(token) },
    });

    return token;
  }

  async cancel(
    appointment: Appointment,
    now: Date,
    onlyIfNotMoved: boolean,
  ): Promise<boolean> {
    const { count } = await getClient().appointment.updateMany({
      where: {
        id: appointment.id,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        scheduledAt: {
          gt: now,
          ...(onlyIfNotMoved && { equals: appointment.scheduledAt }),
        },
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    return count === 1;
  }

  async reschedule(
    appointment: Appointment,
    scheduledAt: Date,
  ): Promise<boolean> {
    const { count } = await getClient().appointment.updateMany({
      where: {
        id: appointment.id,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        scheduledAt: appointment.scheduledAt,
        rescheduleCount: { lt: MAX_RESCHEDULES },
      },
      data: { scheduledAt, rescheduleCount: { increment: 1 } },
    });

    return count === 1;
  }
}
