export const MAX_DOCTOR_NOTICES_PER_WINDOW = 10;
export const DOCTOR_NOTICE_WINDOW_MS = 60 * 60 * 1000;

// En memoria y por instancia: basta para acotar el correo que un anónimo puede provocar hacia un médico.
export class DoctorNoticeLimiter {
  private readonly sentAt = new Map<string, number[]>();

  tryAcquire(doctorProfileId: string, now: number = Date.now()): boolean {
    const recent = (this.sentAt.get(doctorProfileId) ?? []).filter(
      (timestamp) => now - timestamp < DOCTOR_NOTICE_WINDOW_MS,
    );

    if (recent.length >= MAX_DOCTOR_NOTICES_PER_WINDOW) {
      this.sentAt.set(doctorProfileId, recent);
      return false;
    }

    this.sentAt.set(doctorProfileId, [...recent, now]);
    return true;
  }
}

export const doctorNoticeLimiter = new DoctorNoticeLimiter();
