import type {
  AppointmentPortal,
  IGetAppointmentPortalQuery,
} from "@/application/queries/appointment/get-appointment-portal.query";
import {
  canCancel,
  hasStarted,
  rescheduleBlockedBy,
} from "@/domain/entities/appointment/entity";
import { toWallTime } from "@/domain/services/clinic-time";
import {
  hashAccessToken,
  isAccessTokenFormat,
} from "../../appointment-access-token";
import { getClient } from "../../transaction-context";

export class GetAppointmentPortalQuery implements IGetAppointmentPortalQuery {
  async execute(token: string): Promise<AppointmentPortal | null> {
    if (!isAccessTokenFormat(token)) return null;

    const accessToken = await getClient().appointmentAccessToken.findUnique({
      where: { tokenHash: hashAccessToken(token) },
      select: {
        appointment: {
          select: {
            status: true,
            specialty: true,
            scheduledAt: true,
            durationMinutes: true,
            rescheduleCount: true,
            doctorProfileId: true,
            clinicId: true,
            patient: { select: { name: true } },
            clinic: { select: { name: true, address: true } },
            doctorProfile: {
              select: { user: { select: { name: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!accessToken) return null;

    const { appointment } = accessToken;
    const now = new Date();
    if (hasStarted(appointment, now)) return null;

    const { date, time } = toWallTime(appointment.scheduledAt);
    const { user } = appointment.doctorProfile;

    return {
      status: appointment.status,
      patientName: appointment.patient.name,
      specialty: appointment.specialty,
      doctorName: `${user.name} ${user.lastName}`,
      doctorProfileId: appointment.doctorProfileId,
      clinicId: appointment.clinicId,
      clinicName: appointment.clinic.name,
      clinicAddress: appointment.clinic.address,
      date,
      time,
      durationMinutes: appointment.durationMinutes,
      canCancel: canCancel(appointment, now),
      rescheduleBlockedBy: rescheduleBlockedBy(appointment, now),
    };
  }
}
