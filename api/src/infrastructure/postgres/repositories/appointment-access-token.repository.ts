import { createHash, randomBytes } from "node:crypto";
import type { IAppointmentAccessTokenRepository } from "@/domain/repositories/appointment-access-token.repository";
import { getClient } from "../transaction-context";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class AppointmentAccessTokenRepository
  implements IAppointmentAccessTokenRepository
{
  async issue(appointmentId: string): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");

    await getClient().appointmentAccessToken.create({
      data: { appointmentId, tokenHash: hashToken(token) },
    });

    return token;
  }

  async findAppointmentId(token: string): Promise<string | null> {
    if (!TOKEN_PATTERN.test(token)) return null;

    const found = await getClient().appointmentAccessToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { appointmentId: true },
    });

    return found?.appointmentId ?? null;
  }
}
