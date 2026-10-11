import {
  getDoctorSlotsParamsSchema,
  getDoctorSlotsQuerySchema,
} from "@/application/queries/doctor-profile/get-doctor-slots.query";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance } from "fastify";
import { policy } from "@/plugins/policy";

export default async function doctorProfileRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Huecos reservables de un rango de días: la disponibilidad semanal del
  // doctor menos las citas que ya ocupan esas horas. El wizard pide una semana
  // cada vez que el paciente navega.
  app.get(
    "/:doctorProfileId/slots",
    {
      schema: {
        params: getDoctorSlotsParamsSchema,
        querystring: getDoctorSlotsQuerySchema,
      },
      // Pública: la usa el paciente al reservar, sin sesión.
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const query = new GetDoctorSlotsQuery();

        const result = await query.execute({
          doctorProfileId: request.params.doctorProfileId,
          from: request.query.from,
          to: request.query.to,
        });

        return reply.status(200).send(result);
      } catch (error) {
        console.error("Ocurrio un error al obtener los horarios:", error);

        return reply.status(500).send({
          message: "Ocurrio un error al obtener los horarios disponibles",
        });
      }
    },
  );
}
