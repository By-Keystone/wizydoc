import { NotFound } from "@/application/errors/not-found.error";
import {
  AppointmentForMetrics,
  buildPatientMetrics,
} from "@/domain/services/patient-metrics";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const getPatientsSchema = z.object({
  accountId: z.string(),
});

export const getPatientsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT),
  from: z.uuid().optional(),
  clinicId: z.uuid().optional(),
});

type GetPatientsQueryDto = z.infer<typeof getPatientsQuerySchema>;
export type GetPatientsDto = z.infer<typeof getPatientsSchema> &
  GetPatientsQueryDto;

export class GetPatientsUseCase {
  constructor() {}

  async execute(input: GetPatientsDto) {
    const client = getClient();

    if (input.clinicId) await this.assertClinicInAccount(input);

    // `id` es `uuid(7)`: lleva el instante de creación en los bits altos, así
    // que ordenarlo es ordenar por antigüedad y `lt` significa "anterior a".
    // Con un uuid v4 este cursor daría un orden estable pero arbitrario.
    const patients = await client.patient.findMany({
      where: {
        accountId: input.accountId,
        ...(input.from && { id: { lt: input.from } }),
        ...(input.clinicId && {
          appointments: { some: { clinicId: input.clinicId } },
        }),
      },
      orderBy: { id: "desc" },
      take: input.limit + 1,
    });

    const hasMore = patients.length > input.limit;
    const page = hasMore ? patients.slice(0, input.limit) : patients;

    const appointmentsByPatient = await this.loadAppointments(
      page.map((patient) => patient.id),
    );

    return {
      patients: page.map((patient) => ({
        id: patient.id,
        name: patient.name,
        lastName: patient.lastName,
        phone: patient.phone,
        email: patient.email,
        documentType: patient.documentType,
        documentNumber: patient.documentNumber,
        birthDate: patient.birthDate,
        ...buildPatientMetrics(appointmentsByPatient.get(patient.id) ?? []),
      })),
      hasMore,
      nextFrom: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Filtrar por una clínica de otra cuenta devuelve 404 y no 403: distinguirlos
   * revelaría qué clínicas existen fuera de la cuenta del usuario.
   */
  private async assertClinicInAccount(input: GetPatientsDto) {
    const clinic = await getClient().clinic.findFirst({
      where: {
        resourceId: input.clinicId,
        resource: { accountId: input.accountId },
      },
      select: { resourceId: true },
    });

    if (!clinic) throw new NotFound("Clinic not found");
  }

  /**
   * Las métricas se cuentan sobre toda la cuenta aunque el listado esté filtrado
   * por sede: una sede ve el historial completo del paciente, no solo su trozo.
   */
  private async loadAppointments(patientIds: string[]) {
    const appointments = await getClient().appointment.findMany({
      where: { patientId: { in: patientIds } },
      select: { patientId: true, scheduledAt: true, status: true },
    });

    const byPatient = new Map<string, AppointmentForMetrics[]>();

    for (const appointment of appointments) {
      const forPatient = byPatient.get(appointment.patientId) ?? [];
      forPatient.push(appointment);
      byPatient.set(appointment.patientId, forPatient);
    }

    return byPatient;
  }
}
