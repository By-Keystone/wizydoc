import { NotFound } from "@/application/errors/not-found.error";
import { buildPatientMetrics } from "@/domain/services/patient-metrics";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

export const getPatientDetailParamsSchema = z.object({
  patientId: z.uuid(),
});

export type GetPatientDetailDto = z.infer<
  typeof getPatientDetailParamsSchema
> & {
  accountId: string;
};

export class GetPatientDetailQuery {
  async execute(input: GetPatientDetailDto) {
    const client = getClient();

    // `findFirst` acotando por `accountId`, nunca `findUnique` por id: esta ruta
    // no lleva `:resourceId`, así que la política no resuelve recurso y el
    // aislamiento entre cuentas depende por completo de esta cláusula.
    const patient = await client.patient.findFirst({
      where: { id: input.patientId, accountId: input.accountId },
    });

    if (!patient) throw new NotFound("Patient not found");

    // Todas las citas de la cuenta, no solo las de una sede: entre sedes de la
    // misma organización no hay nada que ocultar, y el historial partido no
    // serviría para atender.
    const appointments = await client.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { scheduledAt: "desc" },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        specialty: true,
        durationMinutes: true,
        clinic: { select: { name: true } },
        doctorProfile: {
          select: { user: { select: { name: true, lastName: true } } },
        },
      },
    });

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        documentType: patient.documentType,
        documentNumber: patient.documentNumber,
        birthDate: patient.birthDate,
        sex: patient.sex,
        emergencyContact: patient.emergencyContact,
        insurer: patient.insurer,
        bloodType: patient.bloodType,
        allergies: patient.allergies,
        background: patient.background,
        medications: patient.medications,
        allergiesReviewedAt: patient.allergiesReviewedAt,
        updatedAt: patient.updatedAt,
        updatedBy: patient.updatedBy,
      },
      history: appointments.map((appointment) => ({
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        specialty: appointment.specialty,
        durationMinutes: appointment.durationMinutes,
        clinicName: appointment.clinic.name,
        doctorName: `${appointment.doctorProfile.user.name} ${appointment.doctorProfile.user.lastName}`,
      })),
      metrics: buildPatientMetrics(appointments),
    };
  }
}
