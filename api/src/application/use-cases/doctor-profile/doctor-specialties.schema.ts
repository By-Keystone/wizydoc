import z from "zod";

export const MAX_SPECIALTIES_PER_DOCTOR = 50;

export const doctorSpecialtiesBodySchema = z.strictObject({
  specialtyIds: z
    .array(z.uuid({ error: "Especialidad inválida" }))
    .max(MAX_SPECIALTIES_PER_DOCTOR, {
      error: "Puedes elegir hasta 50 especialidades",
    }),
});

export const organizationClinicParamsSchema = z.object({
  resourceId: z.uuid(),
  clinicId: z.uuid(),
});
