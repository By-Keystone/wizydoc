import { Forbidden } from "@/application/errors/forbidden.error";
import { NotFound } from "@/application/errors/not-found.error";
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

export class UpdatePatientRecordUseCase {
  async execute(input: UpdatePatientRecordDto) {
    const client = getClient();

    const patient = await client.patient.findFirst({
      where: { id: input.patientId, accountId: input.accountId },
      select: { id: true, allergies: true, allergiesReviewedAt: true },
    });

    if (!patient) throw new NotFound("Patient not found");

    if (this.touchesHealthData(input) && !(await this.isClinicalStaff(input))) {
      throw new Forbidden("Solo el personal sanitario puede editar los datos de salud");
    }

    const { patientId, accountId, userId, allergiesReviewed, ...fields } = input;

    return client.patient.update({
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
   * El rol vive en la membership de cada recurso, y un mismo usuario puede ser
   * ADMIN en una sede y USER en otra: a nivel de cuenta no existe «el rol». Basta
   * con tener una membership sanitaria viva en la cuenta.
   */
  private async isClinicalStaff(input: UpdatePatientRecordDto) {
    const membership = await getClient().userResourceMembership.findFirst({
      where: {
        userId: input.userId,
        accountId: input.accountId,
        deletedAt: null,
        role: { in: ["ADMIN", "DOCTOR"] },
      },
      select: { id: true },
    });

    return membership !== null;
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

    if (input.allergiesReviewed === undefined && input.allergies === undefined) {
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
