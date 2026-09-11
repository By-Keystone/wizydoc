import { AppointmentStatus, MembershipRole } from "@prisma/client";
import z from "zod";

export const getClinicAppointmentsParamsSchema = z.object({
  resourceId: z.string(),
});

export type GetClinicAppointmentsDto = z.infer<
  typeof getClinicAppointmentsParamsSchema
> & { role: MembershipRole; userId: string };

/**
 * Cita de la agenda del día. Un DOCTOR sólo recibe las suyas; el resto de roles
 * con membership ven las de toda la clínica, igual que en las métricas.
 */
export interface ClinicAppointment {
  id: string;
  scheduledAt: Date;
  /**
   * Hora de reloj de la clínica (`"09:00"`), ya resuelta con su huso. Evita que
   * el cliente tenga que conocerlo para pintar la agenda.
   */
  time: string;
  durationMinutes: number;
  status: AppointmentStatus;
  specialty: string;
  patient: {
    name: string;
    lastName: string;
    phone: string;
  };
  doctor: {
    name: string;
    lastName: string;
  };
}

export interface IGetClinicAppointmentsQuery {
  execute(dto: GetClinicAppointmentsDto): Promise<ClinicAppointment[]>;
}
