import type { DoctorSlots } from "@/application/queries/doctor-profile/get-doctor-slots.query";

export interface IGetRescheduleSlotsQuery {
  execute(token: string, range: unknown): Promise<DoctorSlots>;
  hasSlots(token: string): Promise<boolean>;
  doctorHasSlotFarEnough(doctorProfileId: string, now: Date): Promise<boolean>;
}
