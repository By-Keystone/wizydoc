import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import { refreshTokenSchema } from "../domain/value-objects/refresh-token.vo";
import type {
  ISessionProvider,
  RefreshedSession,
} from "./ports/session-provider.port";

export const refreshSessionInputSchema = z.object(
  { refreshToken: refreshTokenSchema },
  { error: INVALID_REQUEST },
);

export type RefreshSessionInput = z.output<typeof refreshSessionInputSchema>;

export class RefreshSessionUseCase {
  constructor(private readonly sessions: Pick<ISessionProvider, "refresh">) {}

  execute({
    refreshToken,
  }: RefreshSessionInput): Promise<RefreshedSession | undefined> {
    return this.sessions.refresh(refreshToken);
  }
}
