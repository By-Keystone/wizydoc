import { z } from "zod";
import { INVALID_REQUEST } from "../../shared/messages";
import { trimmedTextSchema } from "../../shared/trimmed-text";
import { createOwnerClinic } from "../domain/clinic.entity";
import type { IOnboardingRepository } from "../domain/repository/onboarding.repository";
import type { OnboardingStep, User } from "../domain/user.entity";

export const CREATE_CLINIC_STEPS: [OnboardingStep, ...OnboardingStep[]] = [
  "CLINIC",
];

export const createClinicInputSchema = z.object(
  {
    name: trimmedTextSchema({
      maxLength: 100,
      missing: "Escribe el nombre de tu consultorio.",
      tooLong:
        "El nombre del consultorio no puede tener más de 100 caracteres.",
    }),
    address: trimmedTextSchema({
      maxLength: 200,
      missing: "Escribe la dirección de tu consultorio.",
      tooLong: "La dirección no puede tener más de 200 caracteres.",
    }),
    specialty: trimmedTextSchema({
      maxLength: 100,
      missing: "Escribe tu especialidad.",
      tooLong: "La especialidad no puede tener más de 100 caracteres.",
    }),
  },
  { error: INVALID_REQUEST },
);

export type CreateClinicInput = z.output<typeof createClinicInputSchema>;

export type CreateClinicResult =
  | { kind: "created"; organizationId: string; clinicId: string }
  | { kind: "already-created" };

export class CreateClinicUseCase {
  constructor(
    private readonly onboarding: Pick<IOnboardingRepository, "createClinic">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    user: User,
    input: CreateClinicInput,
  ): Promise<CreateClinicResult> {
    const ownerClinic = createOwnerClinic(
      {
        ownerUserId: user.id,
        accountId: user.accountId,
        name: input.name,
        address: input.address,
        specialty: input.specialty,
      },
      this.now(),
    );
    const wasCreated = await this.onboarding.createClinic(ownerClinic, {
      from: CREATE_CLINIC_STEPS,
      to: "SCHEDULE",
    });
    if (!wasCreated) return { kind: "already-created" };
    return {
      kind: "created",
      organizationId: ownerClinic.organization.id,
      clinicId: ownerClinic.clinic.id,
    };
  }
}
