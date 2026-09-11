import {
  ClinicAppointment,
  GetClinicAppointmentsDto,
  IGetClinicAppointmentsQuery,
} from "@/application/queries/clinic/get-clinic-appointments.query";
import {
  addDays,
  startOfDay,
  today,
  toWallTime,
} from "@/domain/services/clinic-time";
import { getClient } from "../../transaction-context";

export class GetClinicAppointmentsQuery implements IGetClinicAppointmentsQuery {
  async execute(dto: GetClinicAppointmentsDto): Promise<ClinicAppointment[]> {
    // "Hoy" es el día del reloj de la clínica, no el del servidor: en
    // producción corre en UTC y adelantaría el corte varias horas.
    const date = today();
    const startOfToday = startOfDay(date);
    const startOfTomorrow = startOfDay(addDays(date, 1));

    const appointments = await getClient().appointment.findMany({
      where: {
        clinicId: dto.resourceId,
        ...(dto.role === "DOCTOR" && {
          doctorProfile: { userId: dto.userId },
        }),
        scheduledAt: { gte: startOfToday, lt: startOfTomorrow },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        specialty: true,
        doctorProfile: {
          select: { user: { select: { name: true, lastName: true } } },
        },
        patient: { select: { name: true, lastName: true, phone: true } },
      },
    });

    return appointments.map(({ doctorProfile, ...appointment }) => ({
      ...appointment,
      time: toWallTime(appointment.scheduledAt).time,
      doctor: doctorProfile.user,
    }));
  }
}
