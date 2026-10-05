import { ApplicationError } from "@/application/errors/application.errors";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import {
  acceptInvitationParamsSchema,
  AcceptInvitationUseCase,
} from "@/application/use-cases/user-invitation/accept-invitation.usecase";
import {
  INVALID_INVITATION_MESSAGE,
  setPasswordSchema,
  SetPasswordUseCase,
} from "@/application/use-cases/user-invitation/set-password.usecase";
import {
  verifyInvitationTokenParamsSchema,
  VerifyInvitationTokenUseCase,
} from "@/application/use-cases/user-invitation/verify-invitation-token.usecase";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { policy } from "@/plugins/policy";
import auth from "@/infrastructure/vendors/auth/better-auth/auth";
import { fromNodeHeaders } from "better-auth/node";

type UserInvitationRoutesOptions = {};

// Sólo se loguean errName/errCode: el error de Prisma puede incluir el token en los argumentos de la consulta.
function logUnhandledError(
  request: FastifyRequest,
  label: string,
  error: unknown,
) {
  const errName = error instanceof Error ? error.name : "UnknownError";
  const errCode =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  request.log.error({ errName, errCode }, label);
}

export default async function userInvitationRoutes(
  fastify: FastifyInstance,
  opts: UserInvitationRoutesOptions,
) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/:token",
    {
      schema: { params: verifyInvitationTokenParamsSchema },
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const usecase = new VerifyInvitationTokenUseCase();

        const result = await usecase.execute({ token: request.params.token });

        return reply
          .status(200)
          .send({ message: "Invitation successfully verified", data: result });
      } catch (error) {
        if (error instanceof ApplicationError) {
          if (error.statusCode === 422)
            return reply.status(422).send({ message: error.message });

          if (error.statusCode === 400 || error.statusCode === 404)
            return reply
              .status(error.statusCode)
              .send({ message: INVALID_INVITATION_MESSAGE });
        }

        logUnhandledError(request, "[verify-invitation]", error);
        return reply.internalServerError("No se pudo verificar la invitación");
      }
    },
  );

  app.post(
    "/:token/accept",
    {
      schema: { params: acceptInvitationParamsSchema },
      ...policy({ public: true }),
    },
    async (request, reply) => {
      try {
        const usecase = new AcceptInvitationUseCase();

        const result = await usecase.execute({ token: request.params.token });

        return reply
          .status(200)
          .send({ message: "Invitation accepted", data: result });
      } catch (error) {
        if (error instanceof UnprocessableEntity)
          return reply.status(422).send({ message: error.message });

        if (error instanceof BadRequest)
          return reply
            .status(400)
            .send({ message: INVALID_INVITATION_MESSAGE });

        logUnhandledError(request, "[accept-invitation]", error);
        return reply.internalServerError("No se pudo aceptar la invitación");
      }
    },
  );

  app.post(
    "/set-password",
    { schema: { body: setPasswordSchema }, ...policy({ public: true }) },
    async (request, reply) => {
      try {
        const usecase = new SetPasswordUseCase();

        const result = await usecase.execute(request.body);

        try {
          const { headers } = await auth.api.signInEmail({
            body: { email: result.email, password: request.body.password },
            headers: fromNodeHeaders(request.headers),
            returnHeaders: true,
          });

          const setCookie = headers.get("set-cookie");
          if (setCookie) reply.header("set-cookie", setCookie);

          return reply.status(200).send({
            message: "Password successfully set",
            data: {
              accountId: result.accountId,
              isSignedIn: Boolean(setCookie),
            },
          });
        } catch (signInError) {
          // La contraseña ya quedó guardada: un fallo al iniciar sesión no revierte nada; el usuario entra luego desde /login.
          logUnhandledError(request, "[set-password:sign-in]", signInError);

          return reply.status(200).send({
            message: "Password successfully set",
            data: { accountId: result.accountId, isSignedIn: false },
          });
        }
      } catch (error) {
        if (error instanceof BadRequest)
          return reply
            .status(400)
            .send({ message: INVALID_INVITATION_MESSAGE });

        if (error instanceof UnprocessableEntity)
          return reply.status(422).send({ message: error.message });

        logUnhandledError(request, "[set-password]", error);
        return reply.internalServerError("No se pudo configurar la contraseña");
      }
    },
  );
}
