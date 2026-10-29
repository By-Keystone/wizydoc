export interface RecordMissedBookingData {
  accountId: string;
  clinicId: string;
}

export interface IMonthlyBookingsRepository {
  countBooked(accountId: string, month: string): Promise<number>;
  recordMissed(data: RecordMissedBookingData): Promise<void>;
  countMissedSince(accountId: string, since: Date): Promise<number>;
}
