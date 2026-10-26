import { NotFound } from "@/application/errors/not-found.error";
import { normalizePatientContact } from "@/domain/entities/clinic/patient-contact";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

const INVALID_PATIENT_CONTACT =
  "Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.";

export const updatePatientContactParamsSchema = z.object({
  resourceId: z.uuid(),
});

export const updatePatientContactSchema = z.object({
  patientContact: z
    .string({ error: INVALID_PATIENT_CONTACT })
    .nullable()
    .transform((value, context) => {
      if (value === null || value.trim() === "") return null;

      const normalized = normalizePatientContact(value);
      if (normalized === null) {
        context.addIssue({
          code: "custom",
          message: INVALID_PATIENT_CONTACT,
        });
        return z.NEVER;
      }
      return normalized;
    }),
});

export type UpdatePatientContactDto = z.infer<
  typeof updatePatientContactSchema
> & {
  clinicId: string;
  accountId: string;
};

export class UpdatePatientContactUseCase {
  async execute({
    clinicId,
    accountId,
    patientContact,
  }: UpdatePatientContactDto) {
    const { count } = await getClient().clinic.updateMany({
      where: { resourceId: clinicId, resource: { accountId } },
      data: { patientContact },
    });
    if (count === 0) throw new NotFound("Sede no encontrada");

    return { patientContact };
  }
}
