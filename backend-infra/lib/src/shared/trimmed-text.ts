import { z } from "zod";

export interface TrimmedTextMessages {
  maxLength: number;
  missing: string;
  tooLong: string;
}

export const trimmedTextSchema = ({
  maxLength,
  missing,
  tooLong,
}: TrimmedTextMessages) =>
  z
    .string({ error: missing })
    .trim()
    .min(1, { error: missing })
    .max(maxLength, { error: tooLong });
