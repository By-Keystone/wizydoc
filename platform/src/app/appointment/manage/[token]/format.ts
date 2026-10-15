const DAYS_LONG = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// "YYYY-MM-DD" es una etiqueta de calendario: se lee en UTC para que no dependa del huso del navegador.
export function formatWhen(date: string, time: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  const label = `${DAYS_LONG[day.getUTCDay()]} ${day.getUTCDate()} de ${MONTHS_LONG[day.getUTCMonth()]}`;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}, ${time}`;
}
