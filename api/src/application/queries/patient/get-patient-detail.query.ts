import { NotFound } from "@/application/errors/not-found.error";
import type { PatientScope } from "@/domain/entities/patient/scope";
import type { IPatientRepository } from "@/domain/repositories/patient.repository";
import { buildPatientMetrics } from "@/domain/services/patient-metrics";
import { formatDoctorName } from "@/domain/services/doctor-name";
import z from "zod";

export const getPatientDetailParamsSchema = z.object({
  resourceId: z.uuid(),
  patientId: z.uuid(),
});

export interface GetPatientDetailDto {
  accountId: string;
  patientId: string;
  scope: PatientScope;
}

export class GetPatientDetailQuery {
  constructor(private readonly patients: IPatientRepository) {}

  async execute(input: GetPatientDetailDto) {
    const patient = await this.patients.findInScope(input);

    if (!patient) throw new NotFound("Patient not found");

    // Las de todas las sedes de la organización, no solo las del usuario; las de otra organización no entran.
    const appointments = await this.patients.findAppointmentHistory({
      accountId: input.accountId,
      organizationId: input.scope.organizationId,
      patientId: patient.id,
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
        clinicName: appointment.clinicName,
        doctorName: formatDoctorName(appointment.doctor),
      })),
      metrics: buildPatientMetrics(appointments),
    };
  }
}
