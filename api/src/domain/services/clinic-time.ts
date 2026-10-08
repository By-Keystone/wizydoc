/**
 * Conversión entre las horas de pared de la clínica y los instantes que guarda
 * la base de datos.
 *
 * Los horarios (`doctor_schedule.start_time`) y los huecos que ve el paciente
 * son horas de reloj sin zona: "las nueve" significa las nueve en la clínica.
 * `Appointment.scheduledAt` en cambio es un instante absoluto. Traducir de una
 * cosa a la otra exige conocer el huso, y ese es el dato que aporta este
 * módulo.
 *
 * Hoy el huso es único para todo el despliegue. Cuando haya sedes en husos
 * distintos, esto pasa a leerse de una columna en `Clinic` y las funciones
 * reciben la zona por parámetro.
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE ?? "America/Lima";

interface WallTime {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` */
  time: string;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    wallTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Desfase de la zona respecto a UTC, en milisegundos, para un instante dado.
 * Se calcula leyendo ese instante en la zona y comparándolo con su lectura en
 * UTC, que es la única forma de obtenerlo sin dependencias externas.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(instant);

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );

  return asIfUtc - instant.getTime();
}

/**
 * Instante en el que la clínica marca `date` a las `time`.
 *
 * Ejemplo con `America/Lima`: `("2026-08-06", "09:00")` → `2026-08-06T14:00:00Z`.
 */
export function toInstant(
  date: string,
  time: string,
  timeZone: string = CLINIC_TIME_ZONE,
): Date {
  const asIfUtc = Date.parse(`${date}T${time}:00Z`);

  // El desfase depende del instante (horario de verano), y el instante es justo
  // lo que buscamos: aproximamos una vez y corregimos con el desfase real.
  const approximate = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);

  return new Date(asIfUtc - zoneOffsetMs(new Date(approximate), timeZone));
}

/**
 * Qué marca el reloj de la clínica en un instante dado.
 *
 * Ejemplo con `America/Lima`: `2026-08-06T14:00:00Z` → `{ date: "2026-08-06", time: "09:00" }`.
 */
export function toWallTime(
  instant: Date,
  timeZone: string = CLINIC_TIME_ZONE,
): WallTime {
  const parts = wallTimeFormatter(timeZone).formatToParts(instant);

  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour")}:${read("minute")}`,
  };
}

/** Instante en que empieza el día `date` en la clínica. */
export function startOfDay(
  date: string,
  timeZone: string = CLINIC_TIME_ZONE,
): Date {
  return toInstant(date, "00:00", timeZone);
}

/** `YYYY-MM-DD` de hoy según el reloj de la clínica. */
export function today(timeZone: string = CLINIC_TIME_ZONE): string {
  return toWallTime(new Date(), timeZone).date;
}

/** Suma días a una fecha `YYYY-MM-DD` sin salir del calendario. */
export function addDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
