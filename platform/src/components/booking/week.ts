/**
 * Calendario del wizard de reserva.
 *
 * Todo se maneja como `"YYYY-MM-DD"` en vez de `Date`, que arrastra zona y
 * complica comparar días.
 *
 * El día de partida sale del reloj del paciente, no del de la clínica: quien
 * reserva está prácticamente siempre en la misma ciudad. Si no lo está y su
 * fecha va por delante, el calendario puede abrirse en la semana contigua, pero
 * no se puede reservar nada inválido: los huecos los decide el api, que sí
 * conoce el huso de la clínica.
 */

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTH_LABELS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** `"YYYY-MM-DD"` de hoy en el reloj de quien reserva. */
export function todayKey(): string {
  // `en-CA` es el locale que formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Suma días a una fecha. Opera en UTC a propósito: aquí la fecha es una
 * etiqueta de calendario, no un instante, y así no hay saltos por horario de
 * verano.
 */
export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene `date`. */
export function startOfWeek(date: string): string {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=domingo
  return addDays(date, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
}

export function getWeekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Número de día del mes, para pintar la celda. */
export function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

export function dayLabel(index: number): string {
  return DAY_LABELS[index];
}

function monthLabel(date: string): string {
  return MONTH_LABELS[Number(date.slice(5, 7)) - 1];
}

export function formatWeekRange(start: string, end: string): string {
  return `${dayNumber(start)} ${monthLabel(start)} – ${dayNumber(end)} ${monthLabel(end)}`;
}
