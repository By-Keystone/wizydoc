import { z } from "zod";

interface TrimmedTextRules {
  maxLength: number;
  missing: string;
  tooLong: string;
}

export const trimmedTextSchema = ({
  maxLength,
  missing,
  tooLong,
}: TrimmedTextRules) =>
  z
    .string({ error: missing })
    .trim()
    .min(1, { error: missing })
    .max(maxLength, { error: tooLong });
