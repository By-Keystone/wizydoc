import type { ManagedAppointmentRecord } from "@/domain/entities/appointment/self-service";

// Sólo citas que no han empezado y que la autogestión puede mostrar (activas o canceladas).
export interface IManagedAppointmentRepository {
  findByToken(token: string): Promise<ManagedAppointmentRecord | null>;
  findById(id: string): Promise<ManagedAppointmentRecord | null>;
}
