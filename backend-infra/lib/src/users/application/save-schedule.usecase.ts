import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import type { Membership } from "../domain/membership.entity";
import type { IOnboardingRepository } from "../domain/repository/onboarding.repository";
import type { OnboardingStep, User } from "../domain/user.entity";
import { weeklyScheduleSchema } from "../domain/value-objects/weekly-schedule.vo";

export const SAVE_SCHEDULE_STEPS: [OnboardingStep, ...OnboardingStep[]] = [
  "SCHEDULE",
];

const NEXT_STEP: OnboardingStep = "COMPLETED";

export const saveScheduleInputSchema = z
  .object(
    {
      skip: z.boolean({ error: INVALID_REQUEST }).optional(),
      weeklySchedule: z.unknown().optional(),
    },
    { error: INVALID_REQUEST },
  )
  .transform((input, context) => {
    if (input.skip === true) return { skip: true as const };
    const parsed = weeklyScheduleSchema.safeParse(input.weeklySchedule);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? INVALID_REQUEST,
      });
      return z.NEVER;
    }
    return { skip: false as const, weeklySchedule: parsed.data };
  });

export type SaveScheduleInput = z.output<typeof saveScheduleInputSchema>;

export type SaveScheduleResult =
  | { kind: "completed"; onboardingStep: OnboardingStep }
  | { kind: "already-completed" };

export class SaveScheduleUseCase {
  constructor(
    private readonly onboarding: Pick<
      IOnboardingRepository,
      "completeOnboarding"
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    user: User,
    memberships: Membership[],
    input: SaveScheduleInput,
  ): Promise<SaveScheduleResult> {
    const now = this.now();
    const wasCompleted = await this.onboarding.completeOnboarding(
      {
        userId: user.id,
        completedAt: now,
        schedule: input.skip
          ? undefined
          : {
              userId: user.id,
              clinicId: this.findOwnClinicId(user, memberships),
              accountId: user.accountId,
              weeklySchedule: input.weeklySchedule,
              updatedAt: now,
            },
      },
      { from: SAVE_SCHEDULE_STEPS, to: NEXT_STEP },
    );
    return wasCompleted
      ? { kind: "completed", onboardingStep: NEXT_STEP }
      : { kind: "already-completed" };
  }

  private findOwnClinicId(user: User, memberships: Membership[]): string {
    const ownClinics = memberships.filter(
      ({ resourceType, role, accountId }) =>
        resourceType === "CLINIC" &&
        role === "DOCTOR" &&
        accountId === user.accountId,
    );
    if (ownClinics.length !== 1) {
      throw new Error("El usuario no tiene exactamente una sede como médico");
    }
    return ownClinics[0].resourceId;
  }
}
