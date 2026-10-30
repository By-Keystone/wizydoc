import type {
  BookingStatus,
  IGetBookingStatusQuery,
} from "@/application/queries/clinic/get-booking-status.query";
import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import type { IMonthlyBookingsRepository } from "@/domain/repositories/monthly-bookings.repository";
import { currentMonth } from "@/domain/services/clinic-time";
import { MonthlyBookingsRepository } from "../../repositories/monthly-bookings.repository";
import { getClient } from "../../transaction-context";
import { GetAccountEntitlements } from "../subscription/get-account-entitlements.query";

export class GetBookingStatusQuery implements IGetBookingStatusQuery {
  constructor(
    private readonly entitlementsQuery: IGetAccountEntitlements = new GetAccountEntitlements(),
    private readonly monthlyBookings: IMonthlyBookingsRepository = new MonthlyBookingsRepository(),
  ) {}

  async execute(clinicId: string): Promise<BookingStatus | null> {
    const clinic = await getClient().clinic.findUnique({
      where: { resourceId: clinicId },
      select: {
        patientContact: true,
        resource: { select: { accountId: true } },
      },
    });
    if (!clinic) return null;

    const { accountId } = clinic.resource;
    const { monthlyAppointmentCap } =
      await this.entitlementsQuery.execute(accountId);
    const booked = await this.monthlyBookings.countBooked(
      accountId,
      currentMonth(),
    );

    const isAcceptingBookings = isWithinLimit(monthlyAppointmentCap, booked);
    return {
      isAcceptingBookings,
      patientContact: isAcceptingBookings ? null : clinic.patientContact,
    };
  }
}
