import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import { refreshTokenSchema } from "../domain/value-objects/refresh-token.vo";
import type { ISessionProvider } from "./ports/session-provider.port";

export const signOutInputSchema = z.object(
  { refreshToken: refreshTokenSchema },
  { error: INVALID_REQUEST },
);

export type SignOutInput = z.output<typeof signOutInputSchema>;

export class SignOutUseCase {
  constructor(private readonly sessions: Pick<ISessionProvider, "revoke">) {}

  execute({ refreshToken }: SignOutInput): Promise<void> {
    return this.sessions.revoke(refreshToken);
  }
}
