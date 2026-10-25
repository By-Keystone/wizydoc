/**
 * Las citas se guardan como instantes, así que hay que pintarlas en el huso de
 * la clínica: con el del navegador, una cita de las 8:00 en Lima se vería a otra
 * hora para quien mire desde fuera del país.
 */
const CLINIC_TIME_ZONE = "America/Lima";

export const EMPTY = "—";

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

export const formatDateTime = (iso: string) =>
  dateTimeFormatter.format(new Date(iso));

export const formatShortDate = (iso: string | null) =>
  iso ? shortDateFormatter.format(new Date(iso)) : EMPTY;

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
