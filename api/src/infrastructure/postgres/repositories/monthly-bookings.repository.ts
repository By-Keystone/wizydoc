import type {
  IMonthlyBookingsRepository,
  RecordMissedBookingData,
  ReserveIfBelowCapData,
} from "@/domain/repositories/monthly-bookings.repository";
import { startOfDay, today } from "@/domain/services/clinic-time";
import { getClient } from "../transaction-context";

const MAX_MISSED_BOOKINGS_PER_CLINIC_PER_DAY = 50;

export class MonthlyBookingsRepository implements IMonthlyBookingsRepository {
  async reserveIfBelowCap({
    accountId,
    month,
    cap,
  }: ReserveIfBelowCapData): Promise<number | null> {
    // Una sola sentencia: el bloqueo de la fila hace que quien llega segundo vea el total ya sumado.
    const rows = await getClient().$queryRaw<{ booked: number }[]>`
      INSERT INTO account_monthly_bookings (account_id, month, booked)
      VALUES (${accountId}::uuid, ${month}, 1)
      ON CONFLICT (account_id, month) DO UPDATE
        SET booked = account_monthly_bookings.booked + 1
        WHERE ${cap}::int IS NULL
          OR account_monthly_bookings.booked < ${cap}::int
      RETURNING booked
    `;
    return rows[0]?.booked ?? null;
  }

  async countBooked(accountId: string, month: string): Promise<number> {
    const row = await getClient().accountMonthlyBookings.findUnique({
      where: { accountId_month: { accountId, month } },
      select: { booked: true },
    });
    return row?.booked ?? 0;
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
