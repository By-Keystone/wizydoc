import type { OnboardingStep, PersonalData } from "../user.entity";

export interface OnboardingStepTransition {
  from: readonly OnboardingStep[];
  to?: OnboardingStep;
}

export interface IOnboardingRepository {
  savePersonalData(
    userId: string,
    personalData: PersonalData,
    transition: OnboardingStepTransition,
  ): Promise<OnboardingStep | undefined>;
}
