import {
  ACTIVE_APPOINTMENT_STATUSES,
  type Appointment,
  MAX_RESCHEDULES,
} from "@/domain/entities/appointment/entity";
import type {
  CancelAppointmentData,
  IAppointmentRepository,
  RescheduleAppointmentData,
  RescheduleAppointmentOutcome,
} from "@/domain/repositories/appointment.repository";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { toDomain } from "../../mappers/appointment/mapper";
import {
  generateToken,
  hashToken,
  isTokenFormat,
} from "@/domain/services/token-service";
import { getClient } from "../transaction-context";

const UNIQUE_VIOLATION_CODE = "P2002";

export class AppointmentRepository implements IAppointmentRepository {
  async findByAccessToken(token: string): Promise<Appointment | null> {
    if (!isTokenFormat(token)) return null;

    const accessToken = await getClient().appointmentAccessToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { appointment: true },
    });
    return accessToken ? toDomain(accessToken.appointment) : null;
  }

  async issueAccessToken(appointmentId: string): Promise<string> {
    const token = generateToken();
    await getClient().appointmentAccessToken.create({
      data: { appointmentId, tokenHash: hashToken(token) },
    });
    return token;
  }

  async cancel(data: CancelAppointmentData): Promise<boolean> {
    const { count } = await getClient().appointment.updateMany({
      where: {
        id: data.appointmentId,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        ...(data.expectedScheduledAt && {
          scheduledAt: data.expectedScheduledAt,
        }),
      },
      data: { status: "CANCELLED", cancelledAt: data.cancelledAt },
    });
    return count === 1;
  }

  async reschedule(
    data: RescheduleAppointmentData,
  ): Promise<RescheduleAppointmentOutcome> {
    try {
      const { count } = await getClient().appointment.updateMany({
        where: {
          id: data.appointmentId,
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          scheduledAt: data.expectedScheduledAt,
          rescheduleCount: { lt: MAX_RESCHEDULES },
        },
        data: {
          scheduledAt: data.newScheduledAt,
          rescheduleCount: { increment: 1 },
          ...(data.newDoctorProfileId && {
            doctorProfileId: data.newDoctorProfileId,
          }),
        },
      });
      return count === 1 ? "RESCHEDULED" : "NOT_UPDATED";
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION_CODE
      )
        return "SLOT_TAKEN";
      throw error;
    }
  }
}
