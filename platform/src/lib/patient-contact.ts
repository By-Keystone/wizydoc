const MOBILE_CONTACT = /^\+519\d{8}$/;
const COUNTRY_CODE_LENGTH = "+51".length;
const LIMA_AREA_CODE = "1";

export function isMobileContact(contact: string): boolean {
  return MOBILE_CONTACT.test(contact);
}

export function formatPatientContact(contact: string): string {
  const national = contact.slice(COUNTRY_CODE_LENGTH);
  if (isMobileContact(contact)) {
    return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  if (national.startsWith(LIMA_AREA_CODE)) {
    return `(01) ${national.slice(1, 4)} ${national.slice(4)}`;
  }
  return `(0${national.slice(0, 2)}) ${national.slice(2, 5)} ${national.slice(5)}`;
}

export function buildWhatsAppChatUrl(contact: string, message: string): string {
  return `https://wa.me/${contact.slice(1)}?text=${encodeURIComponent(message)}`;
}

export function buildCallUrl(contact: string): string {
  return `tel:${contact}`;
}
