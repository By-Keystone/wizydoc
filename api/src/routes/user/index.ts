import { ApplicationError } from "@/application/errors/application.errors";
import { IEmailService } from "@/application/ports/email-service.port";
import { getUserMembershipSchema } from "@/application/queries/membership/get-user-membership.query";
import {
  inviteUserSchema,
  InviteUserUseCase,
} from "@/application/use-cases/user/invite-user.usecase";
import { policy } from "@/plugins/policy";
import { IAccountRepository } from "@/domain/repositories/account.repository";
import { IUserRepository } from "@/domain/repositories/user.repository";
import { ITransactionManager } from "@/domain/services/transaction-manager";
import { GetUserMembership } from "@/infrastructure/postgres/queries/membership/get-user-membership.query";
import { UserMembershipsQuery } from "@/infrastructure/postgres/queries/membership/get-user-memberships.query";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import { FastifyInstance } from "fastify";

interface UserRoutesOptions {
  userRepository: IUserRepository;
  accountRepository: IAccountRepository;
  transactionManager: ITransactionManager;
  emailService: IEmailService;
}
export default async function userRoutes(
  fastify: FastifyInstance,
  opts: UserRoutesOptions,
) {
  const {
    userRepository,
    accountRepository,
    transactionManager,
    emailService,
  } = opts;

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

        console.log(JSON.stringify(membership, null, 2));

        return reply.status(200).send(membership);
      } catch (error) {
        console.error("Error occured when getting membership:", error);

        return reply.internalServerError(
          error instanceof Error
            ? error.message
            : "Ocurrió un error al obtener membership",
        );
      }
    },
  );

  app.post(
    "/invite",
    {
      schema: { body: inviteUserSchema },
      // resourceId llega en el cuerpo: cuenta y rol ADMIN los comprueba el caso de uso.
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const useCase = new InviteUserUseCase(transactionManager, {
          emailService,
        });

        await useCase.execute({
          ...request.body,
          createdBy: request.user.userId,
          accountId: request.user.accountId!,
        });

        return reply
          .status(200)
          .send({ message: "Se ha enviado la invitación al usuario" });
      } catch (error) {
        if (error instanceof ApplicationError) {
          return reply
            .status(error.statusCode)
            .send({ message: error.message });
        }

        const errName = error instanceof Error ? error.name : "UnknownError";
        const errCode =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;

        request.log.error({ errName, errCode }, "[invite-user]");

        return reply
          .status(500)
          .send({ message: "Ha ocurrido un error al invitar al usuario" });
      }
    },
  );
}
