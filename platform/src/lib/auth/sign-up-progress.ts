import "server-only";

import { COOKIE_NAMES } from "@/lib/auth/cookies";
import { cookies } from "next/headers";
import z from "zod";

export const RESEND_COOLDOWN_SECONDS = 60;
const SIGN_UP_PROGRESS_MAX_AGE_SECONDS = 3600;
const MILLISECONDS_PER_SECOND = 1000;

const signUpProgressSchema = z.object({
  email: z.string(),
  codeRequestedAt: z.number(),
});

export type SignUpProgress = z.infer<typeof signUpProgressSchema>;

export async function readSignUpProgress(): Promise<SignUpProgress | null> {
  const raw = (await cookies()).get(COOKIE_NAMES.signUpProgress)?.value;
  if (!raw) return null;
  try {
    const parsed = signUpProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveSignUpProgress(
  progress: SignUpProgress,
): Promise<void> {
  (await cookies()).set(COOKIE_NAMES.signUpProgress, JSON.stringify(progress), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/register",
    maxAge: SIGN_UP_PROGRESS_MAX_AGE_SECONDS,
  });
}

export function secondsUntilResend(
  progress: SignUpProgress,
  now: number,
): number {
  const elapsedSeconds =
    (now - progress.codeRequestedAt) / MILLISECONDS_PER_SECOND;
  return Math.min(
    RESEND_COOLDOWN_SECONDS,
    Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds)),
  );
}
