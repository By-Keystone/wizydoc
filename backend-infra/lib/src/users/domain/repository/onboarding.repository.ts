import type { OwnerClinic } from "../clinic.entity";
import type { Subscription } from "../subscription.entity";
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

  savePlan(
    subscription: Subscription,
    userId: string,
    transition: OnboardingStepTransition,
  ): Promise<boolean>;

  createClinic(
    ownerClinic: OwnerClinic,
    transition: Required<OnboardingStepTransition>,
  ): Promise<boolean>;
}
