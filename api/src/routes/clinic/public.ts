import { getClinicDoctorsParamsSchema } from "@/application/queries/clinic/get-clinic-doctors.query";
import { GetClinicDoctorsQuery } from "@/infrastructure/postgres/queries/clinic/get-clinic-doctors.query";
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
}
