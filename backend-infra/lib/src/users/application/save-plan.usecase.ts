import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IOnboardingRepository } from "../domain/repository/onboarding.repository";
import {
  BETA_PLAN,
  createSubscription,
  type Plan,
  PLANS,
} from "../domain/subscription.entity";
import type { OnboardingStep, User } from "../domain/user.entity";

export const PLAN_STEPS: [OnboardingStep, ...OnboardingStep[]] = [
  "PLAN",
  "CLINIC",
];

export const savePlanInputSchema = z.object(
  {
    plan: z
      .enum(PLANS, { error: "Elige un plan." })
      .refine((plan) => plan === BETA_PLAN, {
        error: "Durante la beta, todas las cuentas empiezan en Gratis.",
      }),
  },
  { error: INVALID_REQUEST },
);

export class SavePlanUseCase {
  constructor(
    private readonly onboarding: Pick<IOnboardingRepository, "savePlan">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(user: User, plan: Plan): Promise<OnboardingStep> {
    if (user.onboardingStep === "CLINIC") return "CLINIC";

    await this.onboarding.savePlan(
      createSubscription({ accountId: user.accountId, plan }, this.now()),
      user.id,
      { from: ["PLAN"], to: "CLINIC" },
    );
    return "CLINIC";
  }
}
