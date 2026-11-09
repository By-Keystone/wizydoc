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

export const CODE_LENGTH = 6;
export const INCOMPLETE_CODE_ERROR = "Escribe los 6 dígitos del código.";
export const VERIFY_CODE_ERROR =
  "No pudimos comprobar el código. Intenta de nuevo.";

export const signUpCodeSchema = z
  .string({ error: INCOMPLETE_CODE_ERROR })
  .regex(new RegExp(`^\\d{${CODE_LENGTH}}$`), {
    error: INCOMPLETE_CODE_ERROR,
  });
