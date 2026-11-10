import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { errorName } from "../../shared/errors";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IUserRepository } from "../domain/repository/user.repository";
import { emailSchema } from "../domain/value-objects/email.vo";
import { MAXIMUM_PASSWORD_LENGTH } from "../domain/value-objects/password.vo";
import type { ISessionProvider, Session } from "./ports/session-provider.port";

const PASSWORD_REQUIRED = "Escribe tu contraseña.";
export const MINIMUM_REJECTED_SIGN_IN_MILLISECONDS = 1000;

export const signInInputSchema = z.object(
  {
    email: emailSchema,
    password: z
      .string({ error: PASSWORD_REQUIRED })
      .min(1, { error: PASSWORD_REQUIRED })
      .max(MAXIMUM_PASSWORD_LENGTH, { error: PASSWORD_REQUIRED }),
  },
  { error: INVALID_REQUEST },
);

export type SignInInput = z.output<typeof signInInputSchema>;

export type SignInOutcome =
  | { kind: "signed-in"; session: Session }
  | { kind: "rejected" }
  | { kind: "locked-out" };

const REJECTED: SignInOutcome = { kind: "rejected" };

export class SignInUseCase {
  constructor(
    private readonly sessions: Pick<ISessionProvider, "signIn" | "revoke">,
    private readonly users: Pick<IUserRepository, "isConfirmed">,
    private readonly nowInMilliseconds: () => number = Date.now,
    private readonly wait: (milliseconds: number) => Promise<unknown> = sleep,
  ) {}

  async execute(input: SignInInput): Promise<SignInOutcome> {
    const startedAt = this.nowInMilliseconds();
    const attempt = await this.sessions.signIn(input);

    if (attempt.kind === "locked-out") return attempt;
    if (attempt.kind === "accepted") {
      if (await this.users.isConfirmed(attempt.cognitoSub)) {
        return { kind: "signed-in", session: attempt.session };
      }
      await this.revokeWithoutDelivering(attempt.session.refreshToken);
    }

    const millisecondsUntilMinimum =
      startedAt +
      MINIMUM_REJECTED_SIGN_IN_MILLISECONDS -
      this.nowInMilliseconds();
    if (millisecondsUntilMinimum > 0) await this.wait(millisecondsUntilMinimum);
    return REJECTED;
  }

  private async revokeWithoutDelivering(refreshToken: string): Promise<void> {
    try {
      await this.sessions.revoke(refreshToken);
    } catch (error) {
      console.warn(
        "[sign-in] no se pudo revocar el token de una cuenta sin confirmar:",
        errorName(error),
      );
    }
  }
}
