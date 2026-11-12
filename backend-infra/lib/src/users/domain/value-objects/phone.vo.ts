import { z } from "zod";

const COUNTRY_CODE = "51";
const MAX_NATIONAL_NUMBER_LENGTH = 9;
const ONLY_PHONE_CHARACTERS = /^\+?[\d\s\-()]+$/;
const MOBILE_NUMBER = /^9\d{8}$/;
const LIMA_LANDLINE_NUMBER = /^1\d{7}$/;
const PROVINCE_LANDLINE_NUMBER = /^[4-8]\d{7}$/;
const MISSING_PHONE = "Escribe tu celular.";
const INVALID_PHONE =
  "Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.";

const toNationalDigits = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, "");
  const hasPlus = phone.startsWith("+");
  if (hasPlus && !digits.startsWith(COUNTRY_CODE)) return null;

  const hasCountryCode =
    digits.startsWith(COUNTRY_CODE) &&
    (hasPlus || digits.length > MAX_NATIONAL_NUMBER_LENGTH);
  return hasCountryCode ? digits.slice(COUNTRY_CODE.length) : digits;
};

const toInternationalNumber = (phone: string): string | null => {
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
};

export const phoneSchema = z
  .string({ error: MISSING_PHONE })
  .trim()
  .min(1, { error: MISSING_PHONE })
  .transform((raw, context) => {
    const internationalNumber = toInternationalNumber(raw);
    if (internationalNumber === null) {
      context.addIssue({ code: "custom", message: INVALID_PHONE });
      return z.NEVER;
    }
    return internationalNumber;
  })
  .brand<"PhoneVO">();

export type PhoneVO = z.output<typeof phoneSchema>;
