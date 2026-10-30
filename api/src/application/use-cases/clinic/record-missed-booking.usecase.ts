import { NotFound } from "@/application/errors/not-found.error";
import type { IGetClinicDoctorsQuery } from "@/application/queries/clinic/get-clinic-doctors.query";
import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import { isWithinLimit } from "@/domain/entities/subscription/entitlements";
import type { IMonthlyBookingsRepository } from "@/domain/repositories/monthly-bookings.repository";
import { currentMonth } from "@/domain/services/clinic-time";
import { GetClinicDoctorsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-doctors.query";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import { MonthlyBookingsRepository } from "@/infrastructure/postgres/repositories/monthly-bookings.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

export const recordMissedBookingParamsSchema = z.object({
  clinicId: z.uuid(),
});

export interface RecordMissedBookingDto {
  clinicId: string;
  visitorAccountId: string | null;
}

export class RecordMissedBookingUseCase {
  constructor(
    private readonly entitlementsQuery: IGetAccountEntitlements = new GetAccountEntitlements(),
    private readonly monthlyBookings: IMonthlyBookingsRepository = new MonthlyBookingsRepository(),
    private readonly clinicDoctors: IGetClinicDoctorsQuery = new GetClinicDoctorsQuery(),
  ) {}

  private async findAccountIdOf(clinicId: string) {
    const clinic = await getClient().clinic.findUnique({
      where: { resourceId: clinicId },
      select: { resource: { select: { accountId: true } } },
    });
    if (!clinic) throw new NotFound("Sede no encontrada");
    return clinic.resource.accountId;
  }

  private async isMonthFull(accountId: string) {
    const { monthlyAppointmentCap } =
      await this.entitlementsQuery.execute(accountId);
    const booked = await this.monthlyBookings.countBooked(
      accountId,
      currentMonth(),
    );
    return !isWithinLimit(monthlyAppointmentCap, booked);
  }

  private async hasBookableDoctor(clinicId: string) {
    const doctors = await this.clinicDoctors.execute(clinicId);
    return doctors.length > 0;
  }

  async execute({ clinicId, visitorAccountId }: RecordMissedBookingDto) {
    const accountId = await this.findAccountIdOf(clinicId);

    if (visitorAccountId === accountId) return;
    if (!(await this.isMonthFull(accountId))) return;
    if (!(await this.hasBookableDoctor(clinicId))) return;

    await this.monthlyBookings.recordMissed({ accountId, clinicId });
  }
}
