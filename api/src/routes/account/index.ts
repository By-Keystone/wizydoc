import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "@fastify/type-provider-zod";
import { IAccountRepository } from "@/domain/repositories/account.repository";
import { ISubscriptionRepository } from "@/domain/repositories/subscription.repository";
import { IUserRepository } from "@/domain/repositories/user.repository";
import { ITransactionManager } from "@/domain/services/transaction-manager";
import type { BillingService } from "@/application/ports/billing-service.port";
import {
  completeAccountSetupSchema,
  CompleteAccountSetupUseCase,
} from "@/application/use-cases/account/complete-account-setup.usecase";
import { ApplicationError } from "@/application/errors/application.errors";
import { policy } from "@/plugins/policy";

interface AccountRoutesOptions {
  userRepository: IUserRepository;
  accountRepository: IAccountRepository;
  subscriptionRepository: ISubscriptionRepository;
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
}
