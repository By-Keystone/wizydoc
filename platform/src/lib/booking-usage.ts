import type { BookingUsage } from "@/lib/api/clinic/types";

export type UsageLevel = "normal" | "near" | "reached";

const WARNING_PERCENT = 80;

export function usageLevel({
  monthlyCap,
  bookedThisMonth,
}: BookingUsage): UsageLevel | null {
  if (monthlyCap === null) return null;
  if (bookedThisMonth >= monthlyCap) return "reached";
  const warningThreshold = Math.ceil((monthlyCap * WARNING_PERCENT) / 100);
  return bookedThisMonth >= warningThreshold ? "near" : "normal";
}

export function offersPlanUpgrade(usage: BookingUsage): boolean {
  const level = usageLevel(usage);
  return level === "near" || level === "reached";
}

// Fechas de calendario ya en hora de Lima: pasarlas por el huso del navegador o del servidor las desplazaría un día.
function formatCalendarDate(
  year: number,
  monthNumber: number,
  day: number,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("es", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, day)),
  );
}

/** Ejemplo: `"2026-11"` → `"noviembre"`. */
export function formatMonthName(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return formatCalendarDate(year, monthNumber, 1, { month: "long" });
}

/** Ejemplo: `"2026-12-01"` → `"1 de diciembre"`. */
export function formatDayAndMonth(date: string): string {
  const [year, monthNumber, day] = date.split("-").map(Number);
  return formatCalendarDate(year, monthNumber, day, {
    day: "numeric",
    month: "long",
  });
}
