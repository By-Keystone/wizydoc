import { ApplicationError } from "@/application/errors/application.errors";
import { appointmentPortalParamsSchema } from "@/application/queries/appointment/get-appointment-portal.query";
import { CancelAppointmentUseCase } from "@/application/use-cases/appointment/cancel-appointment.usecase";
import { RescheduleAppointmentUseCase } from "@/application/use-cases/appointment/reschedule-appointment.usecase";
import { GetAppointmentPortalQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-portal.query";
import { policy } from "@/plugins/policy";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppointmentLinkUnavailable } from "@/application/errors/appointment-link-unavailable.error";

function replyError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  label: string,
) {
  if (error instanceof ApplicationError)
    return reply
      .status(error.statusCode)
      .send({ message: error.message, code: error.code });

  // Sólo nombre y código: el error de Prisma puede traer el hash del token en los argumentos.
  const errName = error instanceof Error ? error.name : "UnknownError";
  const errCode =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  request.log.error({ errName, errCode }, label);

  return reply
    .status(500)
    .send({ message: "Ocurrió un error al gestionar tu cita" });
}

export default async function appointmentPortalRoutes(
  fastify: FastifyInstance,
) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
  });

  app.get(
    "/:token",
    {
      schema: { params: appointmentPortalParamsSchema },
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const appointment = await new GetAppointmentPortalQuery().execute(
          request.params.token,
        );
        if (!appointment) throw new AppointmentLinkUnavailable();

        return reply.status(200).send(appointment);
      } catch (error) {
        return replyError(request, reply, error, "[get-appointment-portal]");
      }
    },
  );

  app.post(
    "/:token/cancel",
    {
      schema: { params: appointmentPortalParamsSchema },
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const appointment = await new CancelAppointmentUseCase().execute(
          request.params.token,
          request.body,
        );
        return reply.status(200).send(appointment);
      } catch (error) {
        return replyError(request, reply, error, "[cancel-appointment]");
      }
    },
  );

  app.post(
    "/:token/reschedule",
    {
      schema: { params: appointmentPortalParamsSchema },
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const appointment = await new RescheduleAppointmentUseCase().execute(
          request.params.token,
          request.body,
        );
        return reply.status(200).send(appointment);
      } catch (error) {
        return replyError(request, reply, error, "[reschedule-appointment]");
      }
    },
  );

  // Cualquier otra URL bajo el prefijo responde el mismo 404: sin esto caería en el hook de políticas, que responde 401 y registra la URL con el token.
  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/*",
    ...policy({ public: true }),
    handler: async (_request, reply) =>
      reply.status(404).send({
        message: new AppointmentLinkUnavailable().message,
        code: "NOT_FOUND",
      }),
  });
}
