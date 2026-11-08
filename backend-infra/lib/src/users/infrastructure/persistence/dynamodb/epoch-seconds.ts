export const toEpochSeconds = (date: Date): number =>
  Math.floor(date.getTime() / 1000);
