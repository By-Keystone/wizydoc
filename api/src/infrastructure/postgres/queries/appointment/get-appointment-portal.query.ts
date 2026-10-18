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
import { formatDoctorName } from "@/domain/services/doctor-name";
import { TokenService } from "@/domain/services/token-service";
import { getClient } from "../../transaction-context";

export class GetAppointmentPortalQuery implements IGetAppointmentPortalQuery {
  constructor(private readonly tokens: TokenService = new TokenService()) {}

  async execute(token: string): Promise<AppointmentPortal | null> {
    if (!this.tokens.isWellFormed(token)) return null;

    const accessToken = await getClient().appointmentAccessToken.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
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
              select: {
                user: {
                  select: { name: true, lastName: true, treatment: true },
                },
              },
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
      doctorName: formatDoctorName(user),
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
