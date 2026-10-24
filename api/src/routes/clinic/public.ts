import { getClinicDoctorsParamsSchema } from "@/application/queries/clinic/get-clinic-doctors.query";
import { getClinicLocationParamsSchema } from "@/application/queries/clinic/get-clinic-location.query";
import { GetClinicDoctorsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-doctors.query";
import { GetClinicLocationQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-location.query";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance } from "fastify";
import { policy } from "@/plugins/policy";

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
}
