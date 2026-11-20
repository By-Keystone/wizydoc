import type { Subscription } from "../../../accounts/domain/subscription.entity";
import type {
  OnboardingStep,
  PersonalData,
} from "../../../users/domain/user.entity";

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
}
