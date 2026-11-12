import { trimmedTextSchema } from "../../../shared/trimmed-text";

const MAX_NAME_LENGTH = 100;

export const givenNameSchema = trimmedTextSchema({
  maxLength: MAX_NAME_LENGTH,
  missing: "Escribe tu nombre.",
  tooLong: "El nombre no puede tener más de 100 caracteres.",
}).brand<"PersonNameVO">();

export const familyNameSchema = trimmedTextSchema({
  maxLength: MAX_NAME_LENGTH,
  missing: "Escribe tu apellido.",
  tooLong: "El apellido no puede tener más de 100 caracteres.",
}).brand<"PersonNameVO">();

export type PersonNameVO = ReturnType<typeof givenNameSchema.parse>;
