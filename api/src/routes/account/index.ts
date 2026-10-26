import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "@fastify/type-provider-zod";
import type { IAccountRepository } from "@/domain/repositories/account.repository";
import type { IClinicRepository } from "@/domain/repositories/clinic.repository";
import type { IOrganizationRepository } from "@/domain/repositories/organization.repository";
import type { ISubscriptionRepository } from "@/domain/repositories/subscription.repository";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";
import type { BillingService } from "@/application/ports/billing-service.port";
import {
  completeAccountSetupSchema,
  CompleteAccountSetupUseCase,
} from "@/application/use-cases/account/complete-account-setup.usecase";
import {
  createFirstClinicSchema,
  CreateFirstClinicUseCase,
} from "@/application/use-cases/account/create-first-clinic.usecase";
import { ApplicationError } from "@/application/errors/application.errors";
import { Forbidden } from "@/application/errors/forbidden.error";
import { policy } from "@/plugins/policy";

interface AccountRoutesOptions {
  userRepository: IUserRepository;
  accountRepository: IAccountRepository;
  subscriptionRepository: ISubscriptionRepository;
  organizationRepository: IOrganizationRepository;
  clinicRepository: IClinicRepository;
  billingService: BillingService;
  transactionManager: ITransactionManager;
}

export default async function accountRoutes(
  fastify: FastifyInstance,
  opts: AccountRoutesOptions,
) {
  const {
    userRepository,
    accountRepository,
    subscriptionRepository,
    organizationRepository,
    clinicRepository,
    billingService,
    transactionManager,
  } = opts;
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // Onboarding: crea el tenant del usuario autenticado (sesión de Better Auth).
  app.post(
    "/account",
    {
      schema: { body: completeAccountSetupSchema },
      // Sin `account`: este endpoint es justo el que crea la cuenta.
      ...policy({ confirmed: true }),
    },
    async (request, reply) => {
      try {
        const useCase = new CompleteAccountSetupUseCase(
          userRepository,
          accountRepository,
          subscriptionRepository,
          billingService,
          transactionManager,
        );
        const result = await useCase.execute(request.user.userId, request.body);
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return reply
            .status(error.statusCode)
            .send({ message: error.message, code: error.code });
        }
        throw error;
      }
    },
  );

  // Sin :resourceId: la organización todavía no existe. Que sea el dueño y que la
  // cuenta no tenga organizaciones lo comprueba el caso de uso.
  app.post(
    "/account/first-clinic",
    {
      schema: { body: createFirstClinicSchema },
      ...policy({ account: true, confirmed: true, onboarded: true }),
    },
    async (request, reply) => {
      try {
        const { userId, accountId } = request.user;
        if (!accountId)
          throw new Forbidden("Tu usuario no pertenece a ninguna cuenta");

        const useCase = new CreateFirstClinicUseCase(
          organizationRepository,
          clinicRepository,
          transactionManager,
        );
        const created = await useCase.execute({
          ...request.body,
          userId,
          accountId,
        });
        return reply.status(201).send(created);
      } catch (error) {
        if (error instanceof ApplicationError) {
          return reply
            .status(error.statusCode)
            .send({ message: error.message, code: error.code });
        }

        const errName = error instanceof Error ? error.name : "UnknownError";
        request.log.error({ errName }, "[create-first-clinic]");

        return reply.internalServerError("No pudimos crear tu consultorio");
      }
    },
  );
}
