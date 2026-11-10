import { z } from "zod";
import { INVALID_REQUEST } from "../../../shared/messages";

export const refreshTokenSchema = z
  .string({ error: INVALID_REQUEST })
  .min(1, { error: INVALID_REQUEST })
  .brand<"RefreshTokenVO">();
