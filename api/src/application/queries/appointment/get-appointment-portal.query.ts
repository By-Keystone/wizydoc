import type {
  AppointmentStatus,
  RescheduleBlock,
} from "@/domain/entities/appointment/entity";
import z from "zod";

export const appointmentPortalParamsSchema = z.object({
  token: z.string(),
});

export interface AppointmentPortal {
  status: AppointmentStatus;
  patientName: string;
  specialty: string;
  doctorName: string;
  doctorProfileId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  /** `YYYY-MM-DD` en hora de Lima. */
  date: string;
  /** `HH:mm` en hora de Lima. */
  time: string;
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: RescheduleBlock | null;
}

export interface IGetAppointmentPortalQuery {
  execute(token: string): Promise<AppointmentPortal | null>;
}
