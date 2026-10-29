import type { PatientScope } from "@/domain/entities/patient/scope";
import type { IPatientRepository } from "@/domain/repositories/patient.repository";
import {
  type AppointmentForMetrics,
  buildPatientMetrics,
} from "@/domain/services/patient-metrics";
import z from "zod";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SEARCH_MIN_CHARACTERS = 2;
const SEARCH_MAX_CHARACTERS = 80;

export const patientsScopeParamsSchema = z.object({
  resourceId: z.uuid(),
});

export const getPatientsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT),
  from: z.uuid().optional(),
});

const searchTermSchema = z
  .string()
  .max(SEARCH_MAX_CHARACTERS, {
    error: `La búsqueda admite hasta ${SEARCH_MAX_CHARACTERS} caracteres`,
  })
  .transform((term) => term.trim().replace(/\s+/g, " "))
  .refine((term) => term.replaceAll(" ", "").length >= SEARCH_MIN_CHARACTERS, {
    error: `Escribe al menos ${SEARCH_MIN_CHARACTERS} letras o números`,
  });

export const searchPatientsBodySchema = z.object({
  limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
  from: z.uuid().optional(),
  search: searchTermSchema,
});

export type GetPatientsDto = z.infer<typeof getPatientsQuerySchema> & {
  accountId: string;
  scope: PatientScope;
  search?: string;
};

export class GetPatientsUseCase {
  constructor(private readonly patients: IPatientRepository) {}

  async execute(input: GetPatientsDto) {
    const rows = await this.patients.findPageInScope({
      accountId: input.accountId,
      scope: input.scope,
      take: input.limit + 1,
      from: input.from,
      search: input.search,
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const appointmentsByPatient = await this.loadAppointments(
      input,
      page.map((patient) => patient.id),
    );

    return {
      patients: page.map((patient) => ({
        ...patient,
        ...buildPatientMetrics(appointmentsByPatient.get(patient.id) ?? []),
      })),
      hasMore,
      nextFrom: hasMore ? page[page.length - 1].id : null,
    };
  }

  // Solo las de la organización: la última visita y la próxima cita no pueden venir de otra.
  private async loadAppointments(input: GetPatientsDto, patientIds: string[]) {
    const appointments = await this.patients.findAppointmentsForMetrics({
      accountId: input.accountId,
      organizationId: input.scope.organizationId,
      patientIds,
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
