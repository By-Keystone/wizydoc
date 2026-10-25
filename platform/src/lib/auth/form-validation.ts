import z from "zod";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const INVALID_EMAIL_ERROR =
  "Escribe un correo válido, por ejemplo ana@consultorio.com.";
export const PASSWORD_TOO_SHORT_ERROR =
  "Tu contraseña debe tener al menos 8 caracteres.";
export const PASSWORD_TOO_LONG_ERROR =
  "Tu contraseña puede tener hasta 128 caracteres.";

const emailSchema = z.email();

export function validateEmail(email: string): string | undefined {
  if (!email) return "Escribe tu correo.";
  if (!emailSchema.safeParse(email).success) return INVALID_EMAIL_ERROR;
}

export function validatePassword(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_ERROR;
  if (password.length > MAX_PASSWORD_LENGTH) return PASSWORD_TOO_LONG_ERROR;
}

export function hasErrors(fieldErrors: object): boolean {
  return Object.values(fieldErrors).some(Boolean);
}
