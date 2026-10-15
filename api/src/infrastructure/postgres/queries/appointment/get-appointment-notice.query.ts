import type {
  AppointmentNotice,
  DoctorContact,
  IGetAppointmentNoticeQuery,
} from "@/application/queries/appointment/get-appointment-notice.query";
import { getClient } from "../../transaction-context";

const doctorUserSelect = {
  select: { user: { select: { name: true, lastName: true, email: true } } },
} as const;

function toDoctorContact(user: {
  name: string;
  lastName: string;
  email: string;
}): DoctorContact {
  return {
    email: user.email,
    firstName: user.name,
    fullName: `${user.name} ${user.lastName}`,
  };
}

export class GetAppointmentNoticeQuery implements IGetAppointmentNoticeQuery {
  async execute(appointmentId: string): Promise<AppointmentNotice | null> {
    const appointment = await getClient().appointment.findUnique({
      where: { id: appointmentId },
      select: {
        specialty: true,
        scheduledAt: true,
        durationMinutes: true,
        clinicId: true,
        patient: { select: { name: true, lastName: true, email: true } },
        clinic: {
          select: {
            name: true,
            address: true,
            resource: { select: { accountId: true } },
          },
        },
        doctorProfile: doctorUserSelect,
      },
    });
    if (!appointment) return null;

    const { patient, clinic, doctorProfile } = appointment;
    return {
      patientEmail: patient.email,
      patientName: patient.name,
      patientLastName: patient.lastName,
      doctor: toDoctorContact(doctorProfile.user),
      clinicId: appointment.clinicId,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
      accountId: clinic.resource.accountId,
      specialty: appointment.specialty,
      scheduledAt: appointment.scheduledAt,
      durationMinutes: appointment.durationMinutes,
    };
  }

  async findDoctor(doctorProfileId: string): Promise<DoctorContact | null> {
    const doctorProfile = await getClient().doctorProfile.findUnique({
      where: { id: doctorProfileId },
      ...doctorUserSelect,
    });
    return doctorProfile ? toDoctorContact(doctorProfile.user) : null;
  }
}
