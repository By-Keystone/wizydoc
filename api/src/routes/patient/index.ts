import { ApplicationError } from "@/application/errors/application.errors";
import { BadRequest } from "@/application/errors/bad-request.errors";
import {
  getPatientDetailParamsSchema,
  GetPatientDetailQuery,
} from "@/application/queries/patient/get-patient-detail.query";
import {
  getPatientsQuerySchema,
  GetPatientsUseCase,
} from "@/application/use-cases/patient/get-patients.usecase";
import {
  updatePatientRecordSchema,
  UpdatePatientRecordUseCase,
} from "@/application/use-cases/patient/update-patient-record.usecase";
import { policy } from "@/plugins/policy";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import { FastifyInstance, FastifyReply } from "fastify";

const patientPolicy = policy({
  account: true,
  confirmed: true,
  onboarded: true,
});

function handleError(error: unknown, reply: FastifyReply, context: string) {
  if (error instanceof ApplicationError) {
    return reply.status(error.statusCode).send({ message: error.message });
  }

  console.error(context, error);

  return reply.status(500).send({ message: context });
}

export default async function patientRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      ...patientPolicy,
      schema: { querystring: getPatientsQuerySchema },
    },
    async (request, reply) => {
      try {
        const { accountId } = request.user;
        const { limit, from, clinicId } = request.query;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const useCase = new GetPatientsUseCase();

        const { patients, hasMore, nextFrom } = await useCase.execute({
          accountId,
          limit,
          from,
          clinicId,
        });

        return reply.status(200).send({ data: patients, hasMore, nextFrom });
      } catch (error) {
        return handleError(
          error,
          reply,
          "Ocurrió un error al obtener pacientes",
        );
      }
    },
  );

  app.get(
    "/:patientId",
    {
      ...patientPolicy,
      schema: { params: getPatientDetailParamsSchema },
    },
    async (request, reply) => {
      try {
        const { accountId } = request.user;

        if (!accountId)
          throw new BadRequest("User does not belong to an account");

        const query = new GetPatientDetailQuery();

        const result = await query.execute({
          accountId,
          patientId: request.params.patientId,
        });

        return reply.status(200).send({ data: result });
      } catch (error) {
        return handleError(
          error,
          reply,
          "Ocurrió un error al obtener el paciente",
        );
      }
    },
  );

  app.patch(
    "/:patientId",
    {
      ...patientPolicy,
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

        const useCase = new UpdatePatientRecordUseCase();

        await useCase.execute({
          ...request.body,
          accountId,
          userId,
          patientId: request.params.patientId,
        });

        return reply.status(204).send();
      } catch (error) {
        return handleError(
          error,
          reply,
          "Ocurrió un error al actualizar el paciente",
        );
      }
    },
  );
}
