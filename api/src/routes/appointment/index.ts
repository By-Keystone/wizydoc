import {
  CreateApointmentUseCase,
  createAppointmentSchema,
  SLOT_UNAVAILABLE,
} from "@/application/use-cases/appointment/create-appointment.usecase";
import { Prisma } from "@prisma/client";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { policy } from "@/plugins/policy";
import { ApplicationError } from "@/application/errors/application.errors";
import { AppointmentLinkUnavailable } from "@/application/errors/appointment-link-unavailable.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import { appointmentPortalParamsSchema } from "@/application/queries/appointment/get-appointment-portal.query";
import { CancelAppointmentUseCase } from "@/application/use-cases/appointment/cancel-appointment.usecase";
import { RescheduleAppointmentUseCase } from "@/application/use-cases/appointment/reschedule-appointment.usecase";
import { GetAppointmentPortalQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-portal.query";
import { GetRescheduleSlotsQuery } from "@/infrastructure/postgres/queries/appointment/get-reschedule-slots.query";

async function preventCaching(_request: FastifyRequest, reply: FastifyReply) {
  reply.header("Cache-Control", "private, no-store");
}

function replyPortalError(
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

interface RouteProps {
  emailService: IEmailService;
}

export default async function appointmentRoutes(
  fastify: FastifyInstance,
  opts: RouteProps,
) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const { emailService } = opts;

  app.post(
    "",
    {
      schema: { body: createAppointmentSchema },
      // El paciente ve este texto en el wizard: sin el prefijo "body/campo" de Fastify.
      schemaErrorFormatter: (errors) => new Error(errors[0].message),
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const command = new CreateApointmentUseCase({ emailService });

        await command.execute(request.body);
        return reply.status(200).send({ message: "Cita creada con éxito" });
      } catch (error) {
        // El horario ya fue tomado por otro paciente (choca con el
        // @@unique([doctorProfileId, scheduledAt])).
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return reply.status(409).send({ message: SLOT_UNAVAILABLE });
        } else if (error instanceof ApplicationError)
          return reply
            .status(error.statusCode)
            .send({ message: error.message });

        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        request.log.error({ errName, errCode }, "[create-appointment]");

        return reply
          .status(500)
          .send({ message: "Ocurrio un error al crear cita" });
      }
    },
  );

  app.get(
    "/manage/:token",
    {
      schema: { params: appointmentPortalParamsSchema },
      onRequest: preventCaching,
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
        return replyPortalError(
          request,
          reply,
          error,
          "[get-appointment-portal]",
        );
      }
    },
  );

  app.post(
    "/manage/:token/cancel",
    {
      schema: { params: appointmentPortalParamsSchema },
      onRequest: preventCaching,
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
        return replyPortalError(request, reply, error, "[cancel-appointment]");
      }
    },
  );

  app.post(
    "/manage/:token/reschedule",
    {
      schema: { params: appointmentPortalParamsSchema },
      onRequest: preventCaching,
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
        return replyPortalError(
          request,
          reply,
          error,
          "[reschedule-appointment]",
        );
      }
    },
  );

  app.get(
    "/manage/:token/slots",
    {
      schema: { params: appointmentPortalParamsSchema },
      onRequest: preventCaching,
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const slots = await new GetRescheduleSlotsQuery().execute(
          request.params.token,
          request.query,
        );
        return reply.status(200).send(slots);
      } catch (error) {
        return replyPortalError(
          request,
          reply,
          error,
          "[get-reschedule-slots]",
        );
      }
    },
  );

  app.get(
    "/manage/:token/has-slots",
    {
      schema: { params: appointmentPortalParamsSchema },
      onRequest: preventCaching,
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const hasSlots = await new GetRescheduleSlotsQuery().hasSlots(
          request.params.token,
        );
        return reply.status(200).send({ hasSlots });
      } catch (error) {
        return replyPortalError(
          request,
          reply,
          error,
          "[has-reschedule-slots]",
        );
      }
    },
  );

  // Cualquier otra URL bajo /manage responde el mismo 404: sin esto caería en el hook de políticas, que responde 401 y registra la URL con el token.
  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/manage/*",
    onRequest: preventCaching,
    ...policy({ public: true }),
    handler: async (_request, reply) =>
      reply.status(404).send({
        message: new AppointmentLinkUnavailable().message,
        code: "NOT_FOUND",
      }),
  });
}
