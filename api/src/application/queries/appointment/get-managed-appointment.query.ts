import z from "zod";
import type { ManagedAppointment } from "@/domain/entities/appointment/self-service";

export const MANAGE_LINK_UNAVAILABLE = "Este enlace ya no está disponible.";

export const managedAppointmentParamsSchema = z.object({ token: z.string() });

export interface IGetManagedAppointmentQuery {
  execute(token: string): Promise<ManagedAppointment | null>;
}
