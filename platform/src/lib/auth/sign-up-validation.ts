import z from "zod";

const INVALID_EMAIL_ERROR = "Correo inválido";
export const TOO_MANY_ATTEMPTS_ERROR =
  "Demasiados intentos. Intenta de nuevo en unos minutos.";
export const REQUEST_CODE_ERROR =
  "No pudimos enviarte el código. Intenta de nuevo.";

const MAX_EMAIL_LENGTH = 254;
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;

const hasValidLocalPartLength = (email: string) =>
  email.split("@")[0].length <= MAX_EMAIL_LOCAL_PART_LENGTH;

const validEmail = z
  .email({ error: INVALID_EMAIL_ERROR })
  .max(MAX_EMAIL_LENGTH, { error: INVALID_EMAIL_ERROR })
  .refine(hasValidLocalPartLength, { error: INVALID_EMAIL_ERROR });

export const signUpEmailSchema = z
  .string({ error: INVALID_EMAIL_ERROR })
  .trim()
  .pipe(validEmail.toLowerCase());
