import type { ULID } from "ulid";
import type { OwnerClinic } from "../clinic.entity";
import type { Schedule } from "../schedule.entity";
import type { Subscription } from "../subscription.entity";
import type { OnboardingStep, PersonalData } from "../user.entity";

export interface OnboardingStepTransition {
  from: readonly OnboardingStep[];
  to?: OnboardingStep;
}

export interface OnboardingCompletion {
  userId: ULID;
  completedAt: Date;
  schedule?: Schedule;
}

export interface IOnboardingRepository {
  savePersonalData(
    userId: string,
    personalData: PersonalData,
    transition: OnboardingStepTransition,
  ): Promise<OnboardingStep | undefined>;

  savePlan(
    subscription: Subscription,
    userId: string,
    transition: OnboardingStepTransition,
  ): Promise<boolean>;

  createClinic(
    ownerClinic: OwnerClinic,
    transition: Required<OnboardingStepTransition>,
  ): Promise<boolean>;

  completeOnboarding(
    completion: OnboardingCompletion,
    transition: Required<OnboardingStepTransition>,
  ): Promise<boolean>;
}
