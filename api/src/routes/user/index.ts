import { ApplicationError } from "@/application/errors/application.errors";
import { NotFound } from "@/application/errors/not-found.error";
import { getUserMembershipSchema } from "@/application/queries/membership/get-user-membership.query";
import {
  updateMyProfileSchema,
  UpdateMyProfileUseCase,
} from "@/application/use-cases/user/update-my-profile.usecase";
import { policy } from "@/plugins/policy";
import type { IAccountRepository } from "@/domain/repositories/account.repository";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import { GetUserMembership } from "@/infrastructure/postgres/queries/membership/get-user-membership.query";
import { UserMembershipsQuery } from "@/infrastructure/postgres/queries/membership/get-user-memberships.query";
import { GetMyProfileQuery } from "@/infrastructure/postgres/queries/user/get-my-profile.query";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function handleProfileError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  message: string,
) {
  if (error instanceof ApplicationError) {
    return reply
      .status(error.statusCode)
      .send({ message: error.message, code: error.code });
  }

  const errName = error instanceof Error ? error.name : "UnknownError";
  request.log.error({ userId: request.user.userId, errName }, "[user-profile]");

  return reply.status(500).send({ message });
}

interface UserRoutesOptions {
  userRepository: IUserRepository;
  accountRepository: IAccountRepository;
}
export default async function userRoutes(
  fastify: FastifyInstance,
  opts: UserRoutesOptions,
) {
  const { userRepository, accountRepository } = opts;

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/me/memberships",
    {
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const query = new UserMembershipsQuery();

        const memberships = await query.execute(
          request.user.userId,
          request.user.accountId!,
        );

        return reply.status(200).send({ memberships });
      } catch (error) {
        console.error(
          "Unknown error occurred when getting user memberships:",
          error,
        );

        return reply
          .status(500)
          .send({ message: "Could not get user memberships" });
      }
    },
  );

  app.get(
    "/me",
    {
      // No exige `onboarded`: este endpoint es justo el que el frontend usa
      // para leer `onboardingCompleted` y decidir si mostrar el onboarding.
      // Exigirlo crea un loop /onboarding → /login para el usuario recién
      // confirmado que aún no completó el onboarding.
      ...policy({ confirmed: true }),
    },
    async (request, reply) => {
      const user = await userRepository.findById(request.user.userId);
      if (!user) {
        return reply.status(404).send({ message: "User not found" });
      }

      // Sin cuenta todavía no hay plan que consultar: el usuario está a medio
      // onboarding y este endpoint es justo el que se lo dice al frontend.
      const entitlements = request.user.accountId
        ? await fastify.accountEntitlements(request)
        : null;

      // El frontend lo usa para decidir si mostrar "Crear organización": sólo el dueño puede crear la primera de la cuenta.
      const account = request.user.accountId
        ? await accountRepository.findById(request.user.accountId)
        : undefined;
      const isAccountOwner = account?.ownerId === request.user.userId;

      return reply.send({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.lastName,
        confirmed: user.confirmed,
        onboardingCompleted: user.onboardingCompleted,
        accountId: request.user.accountId,
        role: request.user.role,
        isAccountOwner,
        entitlements,
      });
    },
  );

  app.get(
    "/me/profile",
    {
      // Sin requireLiveMembership: el dueño recién registrado aún no tiene
      // memberships y debe poder abrir su perfil.
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const profile = await new GetMyProfileQuery().execute(
          request.user.userId,
          request.user.accountId!,
        );
        // Mismo cuerpo que el 404 del PATCH ({ message, code }).
        if (!profile) throw new NotFound("User not found");

        return reply.status(200).send(profile);
      } catch (error) {
        return handleProfileError(
          error,
          request,
          reply,
          "No se pudo obtener tu perfil",
        );
      }
    },
  );

  app.patch(
    "/me/profile",
    {
      ...policy({ account: true, confirmed: true, onboarded: true }),
      schema: { body: updateMyProfileSchema },
    },
    async (request, reply) => {
      try {
        const useCase = new UpdateMyProfileUseCase(
          userRepository,
          new GetMyProfileQuery(),
        );

        const profile = await useCase.execute({
          ...request.body,
          userId: request.user.userId,
          accountId: request.user.accountId!,
        });

        return reply.status(200).send(profile);
      } catch (error) {
        return handleProfileError(
          error,
          request,
          reply,
          "No se pudieron guardar tus datos",
        );
      }
    },
  );

  app.get(
    "/me/resource/:resourceId/membership",
    {
      schema: { params: getUserMembershipSchema },
      // Sin `checkResource`: este endpoint existe precisamente para responder
      // si el usuario tiene membership o no, y ya devuelve vacío cuando no la
      // hay. Exigirla aquí lo convertiría en un 404 en vez de una respuesta.
      ...policy({ confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const query = new GetUserMembership();
        const { resourceId } = request.params;

        const membership = await query.execute({
          userId: request.user.userId,
          resourceId,
        });

        return reply.status(200).send(membership);
      } catch (error) {
        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[get-user-membership]");

        return reply.internalServerError(
          "No se pudo obtener tu acceso a esta sede",
        );
      }
    },
  );
}
