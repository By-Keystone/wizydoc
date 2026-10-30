import type {
  IMonthlyBookingsRepository,
  RecordMissedBookingData,
} from "@/domain/repositories/monthly-bookings.repository";
import {
  firstDayOfNextMonth,
  startOfDay,
  today,
} from "@/domain/services/clinic-time";
import { getClient } from "../transaction-context";

const MAX_MISSED_BOOKINGS_PER_CLINIC_PER_DAY = 50;

export class MonthlyBookingsRepository implements IMonthlyBookingsRepository {
  async countBooked(accountId: string, month: string): Promise<number> {
    return getClient().appointment.count({
      where: {
        clinic: { resource: { accountId } },
        createdAt: {
          gte: startOfDay(`${month}-01`),
          lt: startOfDay(firstDayOfNextMonth(month)),
        },
      },
    });
  }

  // Sin tope, un bucle contra la ruta pública inflaría la tabla y el número de la tarjeta.
  private async hasReachedDailyMissedLimit({
    accountId,
    clinicId,
  }: RecordMissedBookingData): Promise<boolean> {
    const missedToday = await getClient().missedBooking.count({
      where: { accountId, clinicId, createdAt: { gte: startOfDay(today()) } },
    });
    return missedToday >= MAX_MISSED_BOOKINGS_PER_CLINIC_PER_DAY;
  }

  async recordMissed(data: RecordMissedBookingData): Promise<void> {
    try {
      if (await this.hasReachedDailyMissedLimit(data)) return;
      await getClient().missedBooking.create({ data });
    } catch (error) {
      // Un fallo aquí nunca debe cambiar la respuesta al paciente: se registra y se sigue.
      console.error(
        {
          accountId: data.accountId,
          clinicId: data.clinicId,
          errName: error instanceof Error ? error.name : "UnknownError",
        },
        "[record-missed-booking]",
      );
    }
  }

  async countMissedSince(accountId: string, since: Date): Promise<number> {
    return getClient().missedBooking.count({
      where: { accountId, createdAt: { gte: since } },
    });
  }
}
