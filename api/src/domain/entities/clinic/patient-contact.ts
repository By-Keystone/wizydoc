const COUNTRY_CODE = "51";
const MAX_NATIONAL_NUMBER_LENGTH = 9;
const ONLY_PHONE_CHARACTERS = /^\+?[\d\s\-()]+$/;
const MOBILE_NUMBER = /^9\d{8}$/;
const LIMA_LANDLINE_NUMBER = /^1\d{7}$/;
const PROVINCE_LANDLINE_NUMBER = /^[4-8]\d{7}$/;

function toNationalDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const hasPlus = phone.startsWith("+");
  if (hasPlus && !digits.startsWith(COUNTRY_CODE)) return null;

  const hasCountryCode =
    digits.startsWith(COUNTRY_CODE) &&
    (hasPlus || digits.length > MAX_NATIONAL_NUMBER_LENGTH);
  return hasCountryCode ? digits.slice(COUNTRY_CODE.length) : digits;
}

export function normalizePatientContact(raw: string): string | null {
  const phone = raw.trim();
  if (!ONLY_PHONE_CHARACTERS.test(phone)) return null;

  const nationalDigits = toNationalDigits(phone);
  if (nationalDigits === null) return null;

  if (MOBILE_NUMBER.test(nationalDigits)) {
    return `+${COUNTRY_CODE}${nationalDigits}`;
  }

  const landline = nationalDigits.replace(/^0/, "");
  const isLandline =
    LIMA_LANDLINE_NUMBER.test(landline) ||
    PROVINCE_LANDLINE_NUMBER.test(landline);
  return isLandline ? `+${COUNTRY_CODE}${landline}` : null;
}
