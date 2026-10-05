import { ApplicationError } from "@/application/errors/application.errors";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { getOrganizationClinicsSchema } from "@/application/queries/organization/get-organization-clinics.query";
import { getOrganizationsClinicCountSchema } from "@/application/queries/organization/get-organizations-clinic-count.query";
import { getOrganizationsDoctorCountSchema } from "@/application/queries/organization/get-organizations-doctor-count.query";
import {
  type CreateOrganizationDto,
  createOrganizationSchema,
  CreateOrganizationUseCase,
} from "@/application/use-cases/organization/create-organization.use-case";
import {
  createSpecialtyBodySchema,
  createSpecialtyParamsSchema,
  CreateSpecialtyUseCase,
} from "@/application/use-cases/specialty/create-specialty.usecase";
import {
  type GetSpecialtiesDto,
  getSpecialtiesParamSchema,
  GetSpecialtiesUseCase,
} from "@/application/use-cases/specialty/get-specialties.usecase";
import {
  updateSpecialtyBodySchema,
  type UpdateSpecialtyDto,
  updateSpecialtyParamsSchema,
  UpdateSpecialtyUseCase,
} from "@/application/use-cases/specialty/update-specialty.usecase";
import type { IOrganizationRepository } from "@/domain/repositories/organization.repository";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import { GetOrganizationClinicsQuery } from "@/infrastructure/postgres/queries/organization/get-organization-clinics.query";
import { GetOrganizationsClinicCountQuery } from "@/infrastructure/postgres/queries/organization/get-organizations-clinic-count.query";
import { GetOrganizationsDoctorCountQuery } from "@/infrastructure/postgres/queries/organization/get-organizations-doctor-count.query";
import { policy } from "@/plugins/policy";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance } from "fastify";

export interface OrganizationRoutesOptions {
  organizationRepository: IOrganizationRepository;
  userRepository: IUserRepository;
}

export default async function organizationRoutes(
  fastify: FastifyInstance,
  opts: OrganizationRoutesOptions,
) {
  const { organizationRepository, userRepository } = opts;

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Sin recurso en la URL: el rol lo comprueba el caso de uso.
  app.post(
    "/organization",
    {
      schema: { body: createOrganizationSchema },
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const useCase = new CreateOrganizationUseCase(
          organizationRepository,
          userRepository,
        );

        const params = request.params as Record<string, unknown>;

        const body: CreateOrganizationDto = {
          accountId: request.user.accountId!,
          name: request.body.name,
          userId: request.user.userId,
        };

        const result = await useCase.execute(
          body,
          params?.onboarding as boolean | undefined,
        );

        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof ApplicationError)
          return reply.status(error.statusCode).send({
            message:
              error.message ?? "Ha ocurrido un error al crear la organización",
          });

        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[create-organization]");

        return reply.internalServerError(
          "An error occurred when creating organization",
        );
      }
    },
  );

  app.get(
    "/organization/:resourceId/metrics/clinic-count",
    {
      schema: { params: getOrganizationsClinicCountSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const { resourceId } = request.params;

        const query = new GetOrganizationsClinicCountQuery();

        const result = await query.execute({ resourceId });

        return reply.status(200).send(result);
      } catch (error) {
        console.error(
          "An error occurred when getting organization clinic count metrics:",
          error,
        );

        return reply.internalServerError(
          "An error occurred when getting clinic count metric",
        );
      }
    },
  );

  app.get(
    "/organization/:resourceId/metrics/doctor-count",
    {
      schema: { params: getOrganizationsDoctorCountSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const { resourceId } = request.params;

        const query = new GetOrganizationsDoctorCountQuery();

        const result = await query.execute({ resourceId });

        return reply.status(200).send(result);
      } catch (error) {
        console.error(
          "An error occurred when getting organization doctor count metrics:",
          error,
        );

        return reply.internalServerError(
          "An error occurred when getting doctor count metric",
        );
      }
    },
  );

  app.get(
    "/organization/:resourceId/clinics",
    {
      schema: { params: getOrganizationClinicsSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        roles: ["ADMIN"],
      }),
    },
    async (request, reply) => {
      try {
        const { resourceId } = request.params;

        const query = new GetOrganizationClinicsQuery();

        const clinics = await query.execute({ resourceId });

        return reply.status(200).send(clinics);
      } catch (error) {
        console.error(
          "An error occurred when getting clinics of an organization: ",
          error,
        );
        return reply.internalServerError(
          "An error occurred when getting clinics of an organization",
        );
      }
    },
  );

  app.post(
    "/:resourceId/specialty",
    {
      schema: {
        body: createSpecialtyBodySchema,
        params: createSpecialtyParamsSchema,
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
        const usecase = new CreateSpecialtyUseCase();

        await usecase.execute({
          name: request.body.name,
          organizationId: request.params.resourceId,
        });

        return reply
          .status(201)
          .send({ message: "Especialidad creada satisfactoriamente" });
      } catch (error) {
        if (error instanceof UnprocessableEntity)
          return reply
            .status(422)
            .send({ message: error.message, code: error.code });

        console.error("Ocurrió un error creando especialidad:", error);

        return reply
          .status(500)
          .send({ message: "Error creando especialidad" });
      }
    },
  );

  app.get(
    "/:resourceId/specialties",
    {
      schema: { params: getSpecialtiesParamSchema },
      ...policy({
        account: true,
        confirmed: true,
        onboarded: true,
        member: true,
      }),
    },
    async (request, reply) => {
      try {
        const usecase = new GetSpecialtiesUseCase();

        const dto: GetSpecialtiesDto = {
          organizationId: request.params.resourceId,
        };

        const specialties = await usecase.execute(dto);

        return reply.status(200).send({ specialties });
      } catch (error) {
        console.error("An error occurred while getting specialties: ", error);

        return reply
          .status(500)
          .send({ message: "Ocurrió un error al obtener especialidades" });
      }
    },
  );

  app.put(
    "/:resourceId/specialty/:specialtyId",
    {
      schema: {
        params: updateSpecialtyParamsSchema,
        body: updateSpecialtyBodySchema,
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
        const usecase = new UpdateSpecialtyUseCase();

        const dto: UpdateSpecialtyDto = {
          specialtyId: request.params.specialtyId,
          organizationId: request.params.resourceId,
          ...request.body,
        };

        await usecase.execute(dto);

        return reply
          .status(201)
          .send({ message: "Especialidad actualizada satisfactoriamente" });
      } catch (error) {
        if (error instanceof ApplicationError)
          return reply
            .status(error.statusCode)
            .send({ message: error.message });

        console.error("An error ocurred while updating specialty: ", error);

        return reply.status(500).send({
          message: "Ocurrió un problema al actualizar la especialidad",
        });
      }
    },
  );
}
