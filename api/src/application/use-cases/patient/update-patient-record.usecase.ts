import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
import type { PatientScope } from "@/domain/entities/patient/scope";
import type { MembershipRole } from "@/domain/enums/membership-role";
import type { IPatientRepository } from "@/domain/repositories/patient.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

const optionalText = z.string().trim().nullish();

export const updatePatientRecordSchema = z.object({
  name: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  birthDate: z.iso.date().nullish(),
  sex: optionalText,
  phone: z.string().trim().min(1).optional(),
  email: z.email().optional(),
  emergencyContact: optionalText,
  insurer: optionalText,
  bloodType: optionalText,
  allergies: z.array(z.string().trim().min(1)).optional(),
  background: optionalText,
  medications: optionalText,
  /** La casilla «sin alergias conocidas» del formulario. */
  allergiesReviewed: z.boolean().optional(),
});

export type UpdatePatientRecordDto = z.infer<
  typeof updatePatientRecordSchema
> & {
  patientId: string;
  accountId: string;
  userId: string;
  scope: PatientScope;
  role: MembershipRole;
};

/**
 * Datos de salud: los edita personal sanitario. El resto de la ficha
 * —identificación y contacto— lo puede corregir cualquier miembro.
 */
const HEALTH_FIELDS = [
  "bloodType",
  "allergies",
  "background",
  "medications",
  "allergiesReviewed",
] as const satisfies readonly (keyof z.infer<
  typeof updatePatientRecordSchema
>)[];

const HEALTH_DATA_EDITOR_ROLES: MembershipRole[] = ["ADMIN", "DOCTOR"];

export class UpdatePatientRecordUseCase {
  constructor(private readonly patients: IPatientRepository) {}

  async execute(input: UpdatePatientRecordDto) {
    const patient = await this.patients.findInScope(input);

    if (!patient) throw new NotFound("Patient not found");

    if (
      this.touchesHealthData(input) &&
      !HEALTH_DATA_EDITOR_ROLES.includes(input.role)
    ) {
      throw new Forbidden(
        "Solo el personal sanitario puede editar los datos de salud",
      );
    }

    const {
      patientId,
      accountId,
      userId,
      scope,
      role,
      allergiesReviewed,
      ...fields
    } = input;

    return getClient().patient.update({
      where: { id: patient.id },
      data: {
        ...fields,
        ...this.resolveAllergiesReview(input, patient.allergiesReviewedAt),
        updatedBy: userId,
      },
    });
  }

  private touchesHealthData(input: UpdatePatientRecordDto) {
    return HEALTH_FIELDS.some((field) => input[field] !== undefined);
  }

  /**
   * Un `allergiesReviewedAt` con fecha significa que a este paciente se le
   * preguntó por sus alergias. Lo sella tanto marcar la casilla como anotar una
   * alergia, porque en ambos casos alguien preguntó.
   */
  private resolveAllergiesReview(
    input: UpdatePatientRecordDto,
    current: Date | null,
  ) {
    const hasAllergies = (input.allergies?.length ?? 0) > 0;

    if (
      input.allergiesReviewed === undefined &&
      input.allergies === undefined
    ) {
      return {};
    }

    if (input.allergiesReviewed === false && !hasAllergies) {
      return { allergiesReviewedAt: null };
    }

    if (input.allergiesReviewed || hasAllergies) {
      return { allergiesReviewedAt: current ?? new Date() };
    }

    return {};
  }
}
