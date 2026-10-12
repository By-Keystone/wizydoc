import type {
  AppointmentNotice,
  IGetAppointmentNoticeQuery,
} from "@/application/queries/appointment/get-appointment-notice.query";
import { getClient } from "../../transaction-context";

export class GetAppointmentNoticeQuery implements IGetAppointmentNoticeQuery {
  async execute(appointmentId: string): Promise<AppointmentNotice> {
    const appointment = await getClient().appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        id: true,
        clinicId: true,
        doctorProfileId: true,
        specialty: true,
        scheduledAt: true,
        patient: { select: { name: true, email: true } },
        clinic: { select: { name: true, address: true } },
        doctorProfile: {
          select: {
            user: { select: { name: true, lastName: true, email: true } },
          },
        },
      },
    });

    const { doctorProfile, ...rest } = appointment;
    return { ...rest, doctor: doctorProfile.user };
  }
}
