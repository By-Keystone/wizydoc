import {
  CreateApointmentUseCase,
  createAppointmentSchema,
  SLOT_UNAVAILABLE,
} from "@/application/use-cases/appointment/create-appointment.usecase";
import { CancelAppointmentByTokenUseCase } from "@/application/use-cases/appointment/cancel-appointment-by-token.usecase";
import {
  RESCHEDULE_SLOT_TAKEN,
  RescheduleAppointmentByTokenUseCase,
} from "@/application/use-cases/appointment/reschedule-appointment-by-token.usecase";
import {
  MANAGE_LINK_UNAVAILABLE,
  managedAppointmentParamsSchema,
} from "@/application/queries/appointment/get-managed-appointment.query";
import { GetManagedAppointmentQuery } from "@/infrastructure/postgres/queries/appointment/get-managed-appointment.query";
import { Prisma } from "@prisma/client";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { policy } from "@/plugins/policy";
import { RATE_LIMITS, limitedBy } from "@/plugins/rate-limit";
import { AppointmentConflict } from "@/application/errors/appointment-conflict.error";
import { ApplicationError } from "@/application/errors/application.errors";
import type { IEmailService } from "@/application/ports/email-service.port";

// El enlace da acceso a la cita: ninguna respuesta debe quedar en una caché.
function noStore(reply: FastifyReply) {
  reply.header("Cache-Control", "private, no-store");
}

function replyManageError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  label: string,
) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return reply
      .status(409)
      .send({ message: RESCHEDULE_SLOT_TAKEN, code: "SLOT_TAKEN" });

  if (error instanceof AppointmentConflict)
    return reply
      .status(error.statusCode)
      .send({ message: error.message, code: error.code });

  if (error instanceof ApplicationError)
    return reply.status(error.statusCode).send({ message: error.message });

  // Sólo errName/errCode: el error de Prisma puede incluir el token en los argumentos de la consulta.
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
      config: {
        ...policy({ public: true }).config,
        ...limitedBy(RATE_LIMITS.bookAppointment),
      },
    },
    async (request, reply) => {
      try {
        const command = new CreateApointmentUseCase({ emailService });

        await command.execute(request.body);
        return reply.status(200).send({ message: "Cita creada con éxito" });
      } catch (error) {
        // El horario ya fue tomado por otro paciente (choca con el índice
        // único parcial appointment_doctor_slot_active_key).
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
      schema: { params: managedAppointmentParamsSchema },
      config: {
        ...policy({ public: true }).config,
        ...limitedBy(RATE_LIMITS.readManagedAppointment),
      },
    },
    async (request, reply) => {
      noStore(reply);

      try {
        const appointment = await new GetManagedAppointmentQuery().execute(
          request.params.token,
        );

        if (!appointment)
          return reply.status(404).send({ message: MANAGE_LINK_UNAVAILABLE });

        return reply.status(200).send(appointment);
      } catch (error) {
        return replyManageError(
          request,
          reply,
          error,
          "[get-managed-appointment]",
        );
      }
    },
  );

  app.post(
    "/manage/:token/cancel",
    {
      schema: { params: managedAppointmentParamsSchema },
      config: {
        ...policy({ public: true }).config,
        ...limitedBy(RATE_LIMITS.cancelManagedAppointment),
      },
    },
    async (request, reply) => {
      noStore(reply);

      try {
        const appointment = await new CancelAppointmentByTokenUseCase({
          emailService,
        }).execute({ token: request.params.token, body: request.body });

        return reply.status(200).send(appointment);
      } catch (error) {
        return replyManageError(request, reply, error, "[cancel-appointment]");
      }
    },
  );

  app.post(
    "/manage/:token/reschedule",
    {
      schema: { params: managedAppointmentParamsSchema },
      config: {
        ...policy({ public: true }).config,
        ...limitedBy(RATE_LIMITS.rescheduleManagedAppointment),
      },
    },
    async (request, reply) => {
      noStore(reply);

      try {
        const appointment = await new RescheduleAppointmentByTokenUseCase({
          emailService,
        }).execute({
          token: request.params.token,
          body: request.body,
        });

        return reply.status(200).send(appointment);
      } catch (error) {
        return replyManageError(
          request,
          reply,
          error,
          "[reschedule-appointment]",
        );
      }
    },
  );
}
