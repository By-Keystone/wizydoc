const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export function daysFromToday(days: number): string {
  return new Date(Date.now() + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}
