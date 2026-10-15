import type {
  CancellationNotice,
  IGetCancellationNoticeQuery,
} from "@/application/queries/appointment/get-cancellation-notice.query";
import { getClient } from "../../transaction-context";

export class GetCancellationNoticeQuery implements IGetCancellationNoticeQuery {
  async execute(appointmentId: string): Promise<CancellationNotice | null> {
    const appointment = await getClient().appointment.findUnique({
      where: { id: appointmentId },
      select: {
        specialty: true,
        scheduledAt: true,
        clinicId: true,
        patient: { select: { name: true, email: true } },
        clinic: {
          select: { name: true, resource: { select: { accountId: true } } },
        },
        doctorProfile: {
          select: { user: { select: { name: true, email: true } } },
        },
      },
    });
    if (!appointment) return null;

    const { patient, clinic, doctorProfile } = appointment;
    return {
      patientEmail: patient.email,
      patientName: patient.name,
      doctorEmail: doctorProfile.user.email,
      doctorName: doctorProfile.user.name,
      clinicId: appointment.clinicId,
      clinicName: clinic.name,
      accountId: clinic.resource.accountId,
      specialty: appointment.specialty,
      scheduledAt: appointment.scheduledAt,
    };
  }
}
