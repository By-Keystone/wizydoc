export const SLOT_DURATION_MINUTES = 30;
export const MAX_DAYS_IN_THE_PAST = 7;
export const MAX_DAYS_AHEAD = 366;

export interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
}
