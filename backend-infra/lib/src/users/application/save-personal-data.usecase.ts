import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import type { IOnboardingRepository } from "../domain/repository/onboarding.repository";
import type { OnboardingStep, PersonalData, User } from "../domain/user.entity";
import {
  familyNameSchema,
  givenNameSchema,
} from "../domain/value-objects/person-name.vo";
import { phoneSchema } from "../domain/value-objects/phone.vo";
import { treatmentSchema } from "../domain/value-objects/treatment.vo";

const CORRECTION_STEPS: OnboardingStep[] = ["PLAN", "CLINIC"];

export const PERSONAL_DATA_STEPS: [OnboardingStep, ...OnboardingStep[]] = [
  "PERSONAL_DATA",
  ...CORRECTION_STEPS,
];

export const savePersonalDataInputSchema = z.object(
  {
    givenName: givenNameSchema,
    familyName: familyNameSchema,
    phone: phoneSchema,
    treatment: treatmentSchema.nullable().default(null),
  },
  { error: INVALID_REQUEST },
);

export class SavePersonalDataUseCase {
  constructor(
    private readonly onboarding: Pick<
      IOnboardingRepository,
      "savePersonalData"
    >,
  ) {}

  async execute(
    user: User,
    personalData: PersonalData,
  ): Promise<OnboardingStep> {
    if (user.onboardingStep === "PERSONAL_DATA") {
      const advancedStep = await this.onboarding.savePersonalData(
        user.id,
        personalData,
        { from: ["PERSONAL_DATA"], to: "PLAN" },
      );
      if (advancedStep) return advancedStep;
    }

    const unchangedStep = await this.onboarding.savePersonalData(
      user.id,
      personalData,
      { from: CORRECTION_STEPS },
    );
    if (!unchangedStep) {
      throw new Error("El paso del onboarding cambió al guardar los datos.");
    }
    return unchangedStep;
  }
}
