import type {
  ClinicMetrics,
  GetClinicMetricsDto,
  IGetClinicMetricsQuery,
} from "@/application/queries/clinic/get-clinic-metrics.query";
import { addDays, startOfDay, today } from "@/domain/services/clinic-time";
import { getClient } from "../../transaction-context";

export class GetClinicMetricsQuery implements IGetClinicMetricsQuery {
  async execute(dto: GetClinicMetricsDto): Promise<ClinicMetrics> {
    const client = getClient();

    // Citas de hoy: rango semiabierto [00:00, 00:00 de mañana) según el reloj
    // de la clínica, no el del servidor.
    const date = today();
    const startOfToday = startOfDay(date);
    const startOfTomorrow = startOfDay(addDays(date, 1));

    const [appointments, doctors, memberships] = await Promise.all([
      client.appointment.count({
        where: {
          doctorProfile: {
            clinicId: dto.resourceId,
            ...(dto.role === "DOCTOR" && { userId: dto.userId }),
          },
          scheduledAt: { gte: startOfToday, lt: startOfTomorrow },
        },
      }),
      client.doctorProfile.count({ where: { clinicId: dto.resourceId } }),
      client.userResourceMembership.count({
        where: { resourceId: dto.resourceId, deletedAt: null },
      }),
    ]);

    return {
      appointments,
      ...(dto.role === "ADMIN" ? { doctors } : {}),
      ...(dto.role === "ADMIN" ? { memberships } : {}),
    };
  }
}
