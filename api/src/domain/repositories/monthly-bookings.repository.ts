export interface ReserveIfBelowCapData {
  accountId: string;
  month: string;
  cap: number | null;
}

export interface RecordMissedBookingData {
  accountId: string;
  clinicId: string;
}

export interface IMonthlyBookingsRepository {
  /** Devuelve el total del mes tras sumar, o `null` si el tope ya estaba alcanzado. */
  reserveIfBelowCap(data: ReserveIfBelowCapData): Promise<number | null>;
  countBooked(accountId: string, month: string): Promise<number>;
  recordMissed(data: RecordMissedBookingData): Promise<void>;
  countMissedSince(accountId: string, since: Date): Promise<number>;
}
