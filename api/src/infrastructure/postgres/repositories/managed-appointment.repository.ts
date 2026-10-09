import {
  ACTIVE_APPOINTMENT_STATUSES,
  type ManagedAppointmentRecord,
  type ManagedAppointmentStatus,
} from "@/domain/entities/appointment/self-service";
import type { IAppointmentAccessTokenRepository } from "@/domain/repositories/appointment-access-token.repository";
import type { IManagedAppointmentRepository } from "@/domain/repositories/managed-appointment.repository";
import { getClient } from "../transaction-context";
import { AppointmentAccessTokenRepository } from "./appointment-access-token.repository";

const MANAGED_STATUSES: ManagedAppointmentStatus[] = [
  ...ACTIVE_APPOINTMENT_STATUSES,
  "CANCELLED",
];

export class ManagedAppointmentRepository
  implements IManagedAppointmentRepository
{
  constructor(
    private readonly tokens: IAppointmentAccessTokenRepository = new AppointmentAccessTokenRepository(),
  ) {}

  async findByToken(token: string): Promise<ManagedAppointmentRecord | null> {
    const appointmentId = await this.tokens.findAppointmentId(token);
    return appointmentId ? this.findById(appointmentId) : null;
  }

  async findById(id: string): Promise<ManagedAppointmentRecord | null> {
    const appointment = await getClient().appointment.findFirst({
      where: {
        id,
        status: { in: MANAGED_STATUSES },
        scheduledAt: { gt: new Date() },
      },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        durationMinutes: true,
        rescheduleCount: true,
        specialty: true,
        clinicId: true,
        doctorProfileId: true,
        patient: { select: { name: true, email: true } },
        clinic: { select: { name: true, address: true } },
        doctorProfile: {
          select: {
            user: { select: { name: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!appointment) return null;

    const { doctorProfile, ...rest } = appointment;
    return {
      ...rest,
      status: appointment.status as ManagedAppointmentStatus,
      doctor: doctorProfile.user,
    };
  }
}
