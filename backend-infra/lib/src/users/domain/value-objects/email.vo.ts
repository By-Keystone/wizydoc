import { z } from "zod";

const INVALID_EMAIL = "Correo inválido";
const SMTP_MAX_LOCAL_PART_LENGTH = 64;
const SMTP_MAX_ADDRESS_LENGTH = 254;

const hasValidLocalPartLength = (email: string) =>
  email.split("@")[0].length <= SMTP_MAX_LOCAL_PART_LENGTH;

const validEmail = z
  .email({ error: INVALID_EMAIL })
  .max(SMTP_MAX_ADDRESS_LENGTH, { error: INVALID_EMAIL })
  .refine(hasValidLocalPartLength, { error: INVALID_EMAIL });

export const emailSchema = z
  .string({ error: INVALID_EMAIL })
  .trim()
  .pipe(validEmail.toLowerCase())
  .brand<"EmailVO">();

export type EmailVO = z.output<typeof emailSchema>;
