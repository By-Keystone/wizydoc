import type { MembershipRole } from "@prisma/client";
import z from "zod";

export const getClinicMetricsParamsSchema = z.object({
  resourceId: z.string(),
});

export type GetClinicMetricsDto = z.infer<
  typeof getClinicMetricsParamsSchema
> & { role: MembershipRole; userId: string };

/**
 * Métricas de una clínica. Lo que se devuelve depende del rol del solicitante:
 * `doctors` y `memberships` sólo llegan a un ADMIN, y para un DOCTOR
 * `appointments` cuenta sólo sus propias citas.
 */
export interface ClinicMetrics {
  appointments: number;
  doctors?: number;
  memberships?: number;
}

export interface IGetClinicMetricsQuery {
  execute(dto: GetClinicMetricsDto): Promise<ClinicMetrics>;
}
