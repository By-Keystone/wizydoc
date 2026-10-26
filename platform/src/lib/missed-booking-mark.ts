const LIMA_TIME_ZONE = "America/Lima";

function storageKey(clinicId: string): string {
  return `missed-booking:${clinicId}`;
}

function limaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIMA_TIME_ZONE }).format(
    new Date(),
  );
}

// Sin almacenamiento (modo privado) la visita se cuenta igual: contar nunca debe romper la página.
export function hasMissedBookingMark(clinicId: string): boolean {
  try {
    return localStorage.getItem(storageKey(clinicId)) === limaToday();
  } catch {
    return false;
  }
}

export function setMissedBookingMark(clinicId: string): void {
  try {
    localStorage.setItem(storageKey(clinicId), limaToday());
  } catch {
    return;
  }
}
