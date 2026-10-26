import { ApplicationError } from "@/application/errors/application.errors";
import { getBookingStatusParamsSchema } from "@/application/queries/clinic/get-booking-status.query";
import { getClinicDoctorsParamsSchema } from "@/application/queries/clinic/get-clinic-doctors.query";
import { getClinicLocationParamsSchema } from "@/application/queries/clinic/get-clinic-location.query";
import {
  recordMissedBookingParamsSchema,
  RecordMissedBookingUseCase,
} from "@/application/use-cases/clinic/record-missed-booking.usecase";
import { GetBookingStatusQuery } from "@/infrastructure/postgres/queries/clinic/get-booking-status.query";
import { GetClinicDoctorsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-doctors.query";
import { GetClinicLocationQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-location.query";
import auth from "@/infrastructure/vendors/auth/better-auth/auth";
import { policy } from "@/plugins/policy";
import { preventCaching } from "@/routes/hooks/prevent-caching";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyRequest } from "fastify";

// La ruta es pública, pero quien la llama con la sesión de un usuario de la cuenta no cuenta como paciente.
async function readSessionAccountId(request: FastifyRequest) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  return session?.user.accountId ?? null;
}

export default async function clinicPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/clinic/:clinicId/doctors",
    {
      schema: { params: getClinicDoctorsParamsSchema },
      // Pública: la usa el paciente al reservar, sin sesión.
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const query = new GetClinicDoctorsQuery();

        const result = await query.execute(request.params.clinicId);

        return reply.status(200).send(result);
      } catch (error) {
        console.error("Error obteniendo doctores de una clinica", error);

        return reply
          .status(500)
          .send({ message: "Error obteniendo doctores de la clínica" });
      }
    },
  );

  app.get(
    "/clinic/:clinicId/location",
    {
      schema: { params: getClinicLocationParamsSchema },
      // Pública: la usa el paciente al reservar, sin sesión.
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const location = await new GetClinicLocationQuery().execute(
          request.params.clinicId,
        );

        if (!location)
          return reply.status(404).send({ message: "Sede no encontrada" });

        return reply.status(200).send(location);
      } catch (error) {
        const errName = error instanceof Error ? error.name : "UnknownError";
        request.log.error({ errName }, "[get-clinic-location]");

        return reply
          .status(500)
          .send({ message: "Error obteniendo la ubicación de la sede" });
      }
    },
  );

  app.get(
    "/clinic/:clinicId/booking-status",
    {
      schema: { params: getBookingStatusParamsSchema },
      onRequest: preventCaching,
      // Pública: la lee el booking del paciente, sin sesión, y el Inicio de la sede para todos los roles.
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const status = await new GetBookingStatusQuery().execute(
          request.params.clinicId,
        );

        if (!status)
          return reply.status(404).send({ message: "Sede no encontrada" });

        return reply.status(200).send(status);
      } catch (error) {
        const errName = error instanceof Error ? error.name : "UnknownError";
        request.log.error({ errName }, "[get-booking-status]");

        return reply
          .status(500)
          .send({ message: "Error obteniendo el estado de las reservas" });
      }
    },
  );

  app.post(
    "/clinic/:clinicId/missed-bookings",
    {
      schema: { params: recordMissedBookingParamsSchema },
      onRequest: preventCaching,
      // Pública: la llama el booking cerrado del paciente, sin sesión. El caso de uso decide si la visita cuenta.
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        await new RecordMissedBookingUseCase().execute({
          clinicId: request.params.clinicId,
          visitorAccountId: await readSessionAccountId(request),
        });

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof ApplicationError)
          return reply
            .status(error.statusCode)
            .send({ message: error.message });

        const errName = error instanceof Error ? error.name : "UnknownError";
        request.log.error({ errName }, "[record-missed-booking]");

        return reply
          .status(500)
          .send({ message: "Error registrando la reserva perdida" });
      }
    },
  );
}
