import { ApplicationError } from "@/application/errors/application.errors";
import { BadRequest } from "@/application/errors/bad-request.errors";
import type { UserMembership } from "@/application/queries/membership/get-user-membership.query";
import {
  getPatientDetailParamsSchema,
  GetPatientDetailQuery,
} from "@/application/queries/patient/get-patient-detail.query";
import {
  getPatientsQuerySchema,
  GetPatientsUseCase,
  patientsScopeParamsSchema,
  searchPatientsBodySchema,
} from "@/application/use-cases/patient/get-patients.usecase";
import {
  updatePatientRecordSchema,
  UpdatePatientRecordUseCase,
} from "@/application/use-cases/patient/update-patient-record.usecase";
import type { PatientScope } from "@/domain/entities/patient/scope";
import { PatientRepository } from "@/infrastructure/postgres/repositories/patient.repository";
import { policy, requireMembership } from "@/plugins/policy";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const patientScopePolicy = policy({
  account: true,
  confirmed: true,
  onboarded: true,
  member: true,
});

function toPatientScope(membership: UserMembership): PatientScope {
  if (membership.resourceType === "CLINIC") {
    return {
      resourceType: "CLINIC",
      resourceId: membership.resourceId,
      organizationId: membership.parentOrganization.resourceId,
    };
  }

  return {
    resourceType: "ORGANIZATION",
    resourceId: membership.resourceId,
    organizationId: membership.resourceId,
  };
}

function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  context: string,
) {
  if (error instanceof ApplicationError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  const errName = error instanceof Error ? error.name : "UnknownError";
  const errCode =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  request.log.error({ errName, errCode }, `[patient] ${context}`);

  return reply.status(500).send({ message: context });
}

export default async function patientRoutes(fastify: FastifyInstance) {
  // La ficha del paciente es un módulo entero, no un endpoint suelto: el plan
  // se comprueba una vez para todas las rutas de este scope. Al registrarse sin
  // `fastify-plugin`, el hook no se escapa al resto de la API.
  fastify.addHook("preHandler", fastify.requireFeature("PATIENT_RECORD"));

  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const patientRepository = new PatientRepository();

  app.get(
    "/in/:resourceId",
    {
      ...patientScopePolicy,
      schema: {
        params: patientsScopeParamsSchema,
        querystring: getPatientsQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const { accountId } = request.user;
        const { limit, from } = request.query;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const useCase = new GetPatientsUseCase(patientRepository);

        const { patients, hasMore, nextFrom } = await useCase.execute({
          accountId,
          scope: toPatientScope(requireMembership(request)),
          limit,
          from,
        });

        return reply.status(200).send({ data: patients, hasMore, nextFrom });
      } catch (error) {
        return handleError(
          error,
          request,
          reply,
          "Ocurrió un error al obtener pacientes",
        );
      }
    },
  );

  app.post(
    "/in/:resourceId/search",
    {
      // POST y no GET: el término va en el cuerpo para que no quede en ningún log de acceso.
      ...patientScopePolicy,
      schema: {
        params: patientsScopeParamsSchema,
        body: searchPatientsBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const { accountId } = request.user;
        const { limit, from, search } = request.body;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const useCase = new GetPatientsUseCase(patientRepository);

        const { patients, hasMore, nextFrom } = await useCase.execute({
          accountId,
          scope: toPatientScope(requireMembership(request)),
          limit,
          from,
          search,
        });

        return reply.status(200).send({ data: patients, hasMore, nextFrom });
      } catch (error) {
        return handleError(
          error,
          request,
          reply,
          "Ocurrió un error al buscar pacientes",
        );
      }
    },
  );

  app.get(
    "/in/:resourceId/:patientId",
    {
      ...patientScopePolicy,
      schema: { params: getPatientDetailParamsSchema },
    },
    async (request, reply) => {
      try {
        const { accountId } = request.user;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const query = new GetPatientDetailQuery(patientRepository);

        const result = await query.execute({
          accountId,
          patientId: request.params.patientId,
          scope: toPatientScope(requireMembership(request)),
        });

        return reply.status(200).send({ data: result });
      } catch (error) {
        return handleError(
          error,
          request,
          reply,
          "Ocurrió un error al obtener el paciente",
        );
      }
    },
  );

  app.patch(
    "/in/:resourceId/:patientId",
    {
      ...patientScopePolicy,
      schema: {
        params: getPatientDetailParamsSchema,
        body: updatePatientRecordSchema,
      },
    },
    async (request, reply) => {
      try {
        const { accountId, userId } = request.user;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const membership = requireMembership(request);
        const useCase = new UpdatePatientRecordUseCase(patientRepository);

        await useCase.execute({
          ...request.body,
          accountId,
          userId,
          patientId: request.params.patientId,
          scope: toPatientScope(membership),
          role: membership.role,
        });

        return reply.status(204).send();
      } catch (error) {
        return handleError(
          error,
          request,
          reply,
          "Ocurrió un error al actualizar el paciente",
        );
      }
    },
  );
}
