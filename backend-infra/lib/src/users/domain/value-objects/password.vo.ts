import { z } from "zod";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 256;
const PASSWORD_ACCEPTED_BY_COGNITO = /^\S(?:.*\S)?$/;
const PASSWORD_TOO_SHORT = `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres`;
const PASSWORD_WITH_SPACES_AT_THE_EDGES =
  "La contraseña no puede empezar ni terminar con un espacio, ni tener saltos de línea";

const countCharacters = (text: string): number => [...text].length;

export const passwordSchema = z
  .string({ error: PASSWORD_TOO_SHORT })
  .refine((password) => countCharacters(password) >= MINIMUM_PASSWORD_LENGTH, {
    error: PASSWORD_TOO_SHORT,
  })
  .max(MAXIMUM_PASSWORD_LENGTH, {
    error: `La contraseña puede tener hasta ${MAXIMUM_PASSWORD_LENGTH} caracteres`,
  })
  .regex(PASSWORD_ACCEPTED_BY_COGNITO, {
    error: PASSWORD_WITH_SPACES_AT_THE_EDGES,
  })
  .brand<"PasswordVO">();

export type PasswordVO = z.output<typeof passwordSchema>;
