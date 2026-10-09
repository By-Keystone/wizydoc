import { ApplicationError } from "@/application/errors/application.errors";
import { NotFound } from "@/application/errors/not-found.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import { getClinicAppointmentsParamsSchema } from "@/application/queries/clinic/get-clinic-appointments.query";
import { getClinicMetricsParamsSchema } from "@/application/queries/clinic/get-clinic-metrics.query";
import { getClinicUsersSchema } from "@/application/queries/clinic/get-clinic-users.query";
import {
  lookupAccountUserBodySchema,
  lookupAccountUserParamsSchema,
} from "@/application/queries/user/lookup-account-user.query";
import {
  type GetDoctorAvailabilityDto,
  getDoctorAvailabilityParamsSchema,
  GetDoctorAvailabilityUseCase,
} from "@/application/use-cases/availability/get-doctor-availability.usecase";
import {
  insertAvailabilityBodySchema,
  type InsertAvailabilityDto,
  insertAvailabilityParamsSchema,
  InsertAvailabilityUseCase,
} from "@/application/use-cases/availability/insert-availability.usecase";
import {
  type CreateClinicDto,
  createClinicBodySchema,
  createClinicParamsSchema,
  CreateClinicUseCase,
} from "@/application/use-cases/clinic/create-clinic.usecase";
import { GetClinicsUseCase } from "@/application/use-cases/clinic/get-clinics.usecase";
import {
  inviteUserBodySchema,
  inviteUserParamsSchema,
  InviteUserUseCase,
} from "@/application/use-cases/user/invite-user.usecase";
import type { IClinicRepository } from "@/domain/repositories/clinic.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import { GetClinicAppointmentsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-appointments.query";
import { GetClinicMetricsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-metrics.query";
import { GetClinicUsersQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-users.query";
import { LookupAccountUserQuery } from "@/infrastructure/postgres/queries/user/lookup-account-user.query";
import { policy, requireMembership } from "@/plugins/policy";
import { requireLiveMembership } from "@/routes/hooks/require-live-membership";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance } from "fastify";

export interface ClinicRoutesOptions {
  clinicRepository: IClinicRepository;
  transactionManager: ITransactionManager;
  emailService: IEmailService;
}

export default async function clinicRoutes(
  fastify: FastifyInstance,
  opts: ClinicRoutesOptions,
) {
  const { clinicRepository, transactionManager, emailService } = opts;

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/organization/:resourceId/clinics",
    {
      schema: {
        params: createClinicParamsSchema,
        body: createClinicBodySchema,
      },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const useCase = new CreateClinicUseCase(clinicRepository);

        const dto: CreateClinicDto = {
          accountId: request.user.accountId!,
          createdBy: request.user.userId,
          ...request.body,
          organizationId: request.params.resourceId,
        };

        const result = await useCase.execute(dto);

        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof ApplicationError)
          return reply
            .status(error.statusCode)
            .send({ message: error.message });

        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[create-clinic]");

        return reply.internalServerError(
          "An error occured when creating clinic",
        );
      }
    },
  );

  app.get(
    "/clinic",
    {
      ...policy({ account: true, confirmed: true, onboarded: true }),
      preHandler: requireLiveMembership(fastify),
    },
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

  app.post(
    "/clinic/:resourceId/invitations",
    {
      schema: {
        params: inviteUserParamsSchema,
        body: inviteUserBodySchema,
      },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const useCase = new InviteUserUseCase(transactionManager, {
          emailService,
        });

        await useCase.execute({
          ...request.body,
          resourceType: "CLINIC",
          resourceId: request.params.resourceId,
          createdBy: request.user.userId,
          accountId: request.user.accountId!,
        });

        return reply
          .status(200)
          .send({ message: "Se ha enviado la invitación al usuario" });
      } catch (error) {
        if (error instanceof ApplicationError) {
          return reply
            .status(error.statusCode)
            .send({ message: error.message });
        }

        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[invite-user]");

        return reply
          .status(500)
          .send({ message: "Ha ocurrido un error al invitar al usuario" });
      }
    },
  );

  // Toda la cuenta, no sólo esta sede (reinvitar entre sedes); POST para que el correo no quede en logs de acceso.
  app.post(
    "/clinic/:resourceId/users/lookup",
    {
      schema: {
        params: lookupAccountUserParamsSchema,
        body: lookupAccountUserBodySchema,
      },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const query = new LookupAccountUserQuery();

        const { resourceId } = request.params;
        const { email } = request.body;

        const user = await query.execute({ resourceId, email });

        return reply.status(200).send({ user });
      } catch (error) {
        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[lookup-account-user]");

        return reply.internalServerError(
          "Ocurrió un error al buscar el usuario",
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
