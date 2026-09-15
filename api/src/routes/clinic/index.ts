import { NotFound } from "@/application/errors/not-found.error";
import { getClinicAppointmentsParamsSchema } from "@/application/queries/clinic/get-clinic-appointments.query";
import { getClinicMetricsParamsSchema } from "@/application/queries/clinic/get-clinic-metrics.query";
import { getClinicUsersSchema } from "@/application/queries/clinic/get-clinic-users.query";
import {
  GetDoctorAvailabilityDto,
  getDoctorAvailabilityParamsSchema,
  GetDoctorAvailabilityUseCase,
} from "@/application/use-cases/availability/get-doctor-availability.usecase";
import {
  insertAvailabilityBodySchema,
  InsertAvailabilityDto,
  insertAvailabilityParamsSchema,
  InsertAvailabilityUseCase,
} from "@/application/use-cases/availability/insert-availability.usecase";
import {
  CreateClinicDto,
  createClinicSchema,
  CreateClinicUseCase,
} from "@/application/use-cases/clinic/create-clinic.usecase";
import { GetClinicsUseCase } from "@/application/use-cases/clinic/get-clinics.usecase";
import { IClinicRepository } from "@/domain/repositories/clinic.repository";
import { GetClinicAppointmentsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-appointments.query";
import { GetClinicMetricsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-metrics.query";
import { GetClinicUsersQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-users.query";
import { policy, requireMembership } from "@/plugins/policy";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import { FastifyInstance } from "fastify";

export interface ClinicRoutesOptions {
  clinicRepository: IClinicRepository;
}

export default async function clinicRoutes(
  fastify: FastifyInstance,
  opts: ClinicRoutesOptions,
) {
  const { clinicRepository } = opts;

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // La clínica cuelga de una organización que llega en el cuerpo, no en la URL,
  // así que `checkResource` no aplica: que esa organización sea de la cuenta del
  // usuario lo garantiza el repositorio.
  app.post(
    "/clinic",
    {
      schema: { body: createClinicSchema },
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const useCase = new CreateClinicUseCase(clinicRepository);

        const dto: CreateClinicDto = {
          accountId: request.user.accountId!,
          createdBy: request.user.userId,
          ...request.body,
        };

        const result = await useCase.execute(dto);

        return reply.status(201).send(result);
      } catch (error) {
        console.error("An error occured when creating clinic:", error);

        return reply.internalServerError(
          "An error occured when creating clinic",
        );
      }
    },
  );

  app.get(
    "/clinic",
    { ...policy({ account: true, confirmed: true, onboarded: true }) },
    async (request, reply) => {
      try {
        const useCase = new GetClinicsUseCase(clinicRepository);

        const result = await useCase.execute(request.user.accountId!);

        return reply.status(200).send(result);
      } catch (error) {
        console.error(`An error occurred when getting clinics: ${error}`);

        return reply.internalServerError(
          "An error occurredn when getting clinics",
        );
      }
    },
  );

  // `roles` resuelve la membership sobre el `:resourceId` de la URL, así que
  // cubre a la vez el rol y que la clínica sea de la cuenta del usuario.
  app.get(
    "/clinic/:resourceId/users",
    {
      schema: { params: getClinicUsersSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const query = new GetClinicUsersQuery();

        const { resourceId } = request.params;

        const users = await query.execute(resourceId);

        return reply.status(200).send(users);
      } catch (error) {
        console.error("Error ocurred when getting clinic users:", error);
        return reply.internalServerError(
          "Error ocurred when getting clinic users",
        );
      }
    },
  );

  // El doctor consulta su propia disponibilidad en una clínica: basta con que
  // tenga membership sobre ella, sea del rol que sea.
  app.get(
    "/clinic/:resourceId/availability",
    {
      schema: { params: getDoctorAvailabilityParamsSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        member: true,
      }),
    },
    async (request, reply) => {
      try {
        const useCase = new GetDoctorAvailabilityUseCase();

        const dto: GetDoctorAvailabilityDto = {
          clinicId: request.params.resourceId,
          userId: request.user.userId,
        };

        const result = await useCase.execute(dto);

        return reply.status(200).send(result);
      } catch (error) {
        console.error("Error getting availabilities for doctor:", error);

        if (error instanceof NotFound) {
          return reply
            .status(error.statusCode)
            .send({ message: error.message, code: error.code });
        }

        return reply.status(500).send({
          message: "Error getting availabilities for doctor",
          code: "INTERNAL_ERROR",
        });
      }
    },
  );

  app.put(
    "/clinic/:resourceId/availability",
    {
      schema: {
        params: insertAvailabilityParamsSchema,
        body: insertAvailabilityBodySchema,
      },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN", "DOCTOR"],
      }),
    },
    async (request, reply) => {
      try {
        const usecase = new InsertAvailabilityUseCase();

        const dto: InsertAvailabilityDto = {
          clinicId: request.params.resourceId,
          userId: request.user.userId,
          availabilities: request.body.availabilities,
        };

        await usecase.execute(dto);

        return reply
          .status(201)
          .send({ message: "Availabilities created successfully" });
      } catch (error) {
        console.error("Error saving availability:", { error });
        return reply.status(500).send({
          message: "Error saving your availability",
        });
      }
    },
  );

  app.get(
    "/clinic/:resourceId/metrics",
    {
      schema: { params: getClinicMetricsParamsSchema },
      ...policy({
        confirmed: true,
        onboarded: true,
        account: true,
        member: true,
        roles: "*",
      }),
      preHandler: fastify.requireFeature("CLINIC_METRICS"),
    },
    async (request, reply) => {
      const membership = requireMembership(request);

      try {
        const query = new GetClinicMetricsQuery();

        const result = await query.execute({
          resourceId: request.params.resourceId,
          role: membership.role,
          userId: request.user.userId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        console.error("Error ocurred getting metrics:", error);

        return reply.internalServerError(
          "An error occurred when getting metrics",
        );
      }
    },
  );

  // Agenda del día. Un DOCTOR ve sólo sus citas; el resto de miembros, las de
  // toda la clínica.
  app.get(
    "/clinic/:resourceId/appointments/today",
    {
      schema: { params: getClinicAppointmentsParamsSchema },
      ...policy({
        confirmed: true,
        onboarded: true,
        account: true,
        member: true,
        roles: "*",
      }),
    },
    async (request, reply) => {
      const membership = requireMembership(request);

      try {
        const query = new GetClinicAppointmentsQuery();

        const result = await query.execute({
          resourceId: request.params.resourceId,
          role: membership.role,
          userId: request.user.userId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        console.error("Error ocurred getting today's appointments:", error);

        return reply.internalServerError(
          "An error occurred when getting appointments",
        );
      }
    },
  );
}
