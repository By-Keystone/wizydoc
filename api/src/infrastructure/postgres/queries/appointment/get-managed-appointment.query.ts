import type {
  IGetManagedAppointmentQuery,
  ManagedAppointment,
} from "@/application/queries/appointment/get-managed-appointment.query";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  rescheduleBlockedBy,
} from "@/domain/entities/appointment/entity";
import { toWallTime } from "@/domain/services/clinic-time";
import {
  hashAccessToken,
  isAccessTokenFormat,
} from "../../appointment-access-token";
import { getClient } from "../../transaction-context";

const MANAGED_STATUSES = [...ACTIVE_APPOINTMENT_STATUSES, "CANCELLED"] as const;

export class GetManagedAppointmentQuery implements IGetManagedAppointmentQuery {
  async execute(token: string): Promise<ManagedAppointment | null> {
    if (!isAccessTokenFormat(token)) return null;

    const now = new Date();
    const appointment = await getClient().appointment.findFirst({
      where: {
        accessTokens: { some: { tokenHash: hashAccessToken(token) } },
        status: { in: [...MANAGED_STATUSES] },
        scheduledAt: { gt: now },
      },
      select: {
        status: true,
        specialty: true,
        scheduledAt: true,
        durationMinutes: true,
        rescheduleCount: true,
        clinicId: true,
        doctorProfileId: true,
        patient: { select: { name: true } },
        clinic: { select: { name: true, address: true } },
        doctorProfile: {
          select: { user: { select: { name: true, lastName: true } } },
        },
      },
    });

    if (!appointment) return null;

    const status = appointment.status as ManagedAppointment["status"];
    const canCancel = status !== "CANCELLED";
    const { date, time } = toWallTime(appointment.scheduledAt);
    const { user } = appointment.doctorProfile;

    return {
      status,
      patientFirstName: appointment.patient.name.split(" ")[0],
      specialty: appointment.specialty,
      doctorName: `${user.name} ${user.lastName}`,
      clinicName: appointment.clinic.name,
      clinicAddress: appointment.clinic.address,
      clinicId: appointment.clinicId,
      doctorProfileId: appointment.doctorProfileId,
      date,
      time,
      durationMinutes: appointment.durationMinutes,
      canCancel,
      rescheduleBlockedBy: canCancel
        ? rescheduleBlockedBy(appointment, now)
        : null,
    };
  }
}
