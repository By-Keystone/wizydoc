import z from "zod";
import type {
  AppointmentStatus,
  RescheduleBlock,
} from "@/domain/entities/appointment/entity";

export const MANAGE_LINK_UNAVAILABLE = "Este enlace ya no está disponible.";

export const managedAppointmentParamsSchema = z.object({ token: z.string() });

export interface ManagedAppointment {
  status: Extract<AppointmentStatus, "PENDING" | "CONFIRMED" | "CANCELLED">;
  patientFirstName: string;
  specialty: string;
  doctorName: string;
  clinicName: string;
  clinicAddress: string;
  clinicId: string;
  doctorProfileId: string;
  /** `YYYY-MM-DD`, hora de pared de la clínica. */
  date: string;
  /** `HH:mm`, hora de pared de la clínica. */
  time: string;
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: RescheduleBlock | null;
}

export interface IGetManagedAppointmentQuery {
  execute(token: string): Promise<ManagedAppointment | null>;
}
