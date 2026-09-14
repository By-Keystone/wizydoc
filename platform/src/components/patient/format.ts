import { AppointmentStatus } from "@/lib/api/patients/types";

/**
 * Las citas se guardan como instantes, así que hay que pintarlas en el huso de
 * la clínica: con el del navegador, una cita de las 8:00 en Lima se vería a otra
 * hora para quien mire desde fuera del país.
 */
const CLINIC_TIME_ZONE = "America/Lima";

export const EMPTY = "—";

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: CLINIC_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: CLINIC_TIME_ZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  timeZone: CLINIC_TIME_ZONE,
});

export const formatDate = (iso: string | null) =>
  iso ? dateFormatter.format(new Date(iso)) : EMPTY;

export const formatDateTime = (iso: string) =>
  dateTimeFormatter.format(new Date(iso));

export const formatShortDate = (iso: string | null) =>
  iso ? shortDateFormatter.format(new Date(iso)) : EMPTY;

/**
 * `birthDate` es `"YYYY-MM-DD"`, una fecha de calendario y no un instante:
 * pasarla por `new Date()` la desplazaría un día según el huso.
 */
export function formatBirthDate(birthDate: string | null) {
  if (!birthDate) return EMPTY;

  const [year, month, day] = birthDate.split("-");

  return `${day}/${month}/${year}`;
}

export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;

  const [year, month, day] = birthDate.split("-").map(Number);
  const today = new Date();

  let age = today.getFullYear() - year;
  const hasHadBirthday =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!hasHadBirthday) age -= 1;

  return age >= 0 ? age : null;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  DNI: "DNI",
  CE: "CE",
  PASSPORT: "Pasaporte",
};

export const formatDocument = (type: string, number: string) =>
  `${DOCUMENT_TYPE_LABELS[type] ?? type} ${number}`;

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Completada",
  NO_SHOW: "No asistió",
};

export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-teal-50 text-teal-700",
  CANCELLED: "bg-gray-100 text-brand-gray",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  NO_SHOW: "bg-red-50 text-red-700",
};
