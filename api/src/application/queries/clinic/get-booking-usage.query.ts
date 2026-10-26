import type { Plan } from "@prisma/client";
import z from "zod";

export const getBookingUsageParamsSchema = z.object({
  resourceId: z.uuid(),
});

export interface BookingUsage {
  plan: Plan;
  monthlyCap: number | null;
  month: string;
  renewsOn: string;
  bookedThisMonth: number;
  missedThisMonth: number;
  nextPlan: { plan: Plan; monthlyCap: number | null } | null;
  patientContact: string | null;
}

export interface GetBookingUsageDto {
  clinicId: string;
  accountId: string;
}

export interface IGetBookingUsageQuery {
  execute(dto: GetBookingUsageDto): Promise<BookingUsage | null>;
}
