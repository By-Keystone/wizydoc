import type {
  BookingUsage,
  GetBookingUsageDto,
  IGetBookingUsageQuery,
} from "@/application/queries/clinic/get-booking-usage.query";
import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import { PLAN_CAPABILITIES } from "@/domain/entities/subscription/plan";
import type { IMonthlyBookingsRepository } from "@/domain/repositories/monthly-bookings.repository";
import {
  currentMonth,
  firstDayOfNextMonth,
  startOfDay,
} from "@/domain/services/clinic-time";
import { MonthlyBookingsRepository } from "../../repositories/monthly-bookings.repository";
import { getClient } from "../../transaction-context";
import { GetAccountEntitlements } from "../subscription/get-account-entitlements.query";

export class GetBookingUsageQuery implements IGetBookingUsageQuery {
  constructor(
    private readonly entitlementsQuery: IGetAccountEntitlements = new GetAccountEntitlements(),
    private readonly monthlyBookings: IMonthlyBookingsRepository = new MonthlyBookingsRepository(),
  ) {}

  async execute({
    clinicId,
    accountId,
  }: GetBookingUsageDto): Promise<BookingUsage | null> {
    const clinic = await getClient().clinic.findFirst({
      where: { resourceId: clinicId, resource: { accountId } },
      select: { patientContact: true },
    });
    if (!clinic) return null;

    const { plan, monthlyAppointmentCap } =
      await this.entitlementsQuery.execute(accountId);
    const month = currentMonth();
    const [bookedThisMonth, missedThisMonth] = await Promise.all([
      this.monthlyBookings.countBooked(accountId, month),
      this.monthlyBookings.countMissedSince(
        accountId,
        startOfDay(`${month}-01`),
      ),
    ]);

    const nextPlan = PLAN_CAPABILITIES[plan].nextPlan;
    return {
      plan,
      monthlyCap: monthlyAppointmentCap,
      month,
      renewsOn: firstDayOfNextMonth(month),
      bookedThisMonth,
      missedThisMonth,
      nextPlan: nextPlan && {
        plan: nextPlan,
        monthlyCap: PLAN_CAPABILITIES[nextPlan].monthlyAppointmentCap,
      },
      patientContact: clinic.patientContact,
    };
  }
}
