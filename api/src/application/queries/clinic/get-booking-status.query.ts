import z from "zod";

export const getBookingStatusParamsSchema = z.object({
  clinicId: z.uuid(),
});

export interface BookingStatus {
  isAcceptingBookings: boolean;
  patientContact: string | null;
}

export interface IGetBookingStatusQuery {
  execute(clinicId: string): Promise<BookingStatus | null>;
}
