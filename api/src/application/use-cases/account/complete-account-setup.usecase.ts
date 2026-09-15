import { Plan } from "@prisma/client";
import { z } from "zod";
import type { IAccountRepository } from "@/domain/repositories/account.repository";
import type { ISubscriptionRepository } from "@/domain/repositories/subscription.repository";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";

export const completeAccountSetupSchema = z.object({
  accountName: z.string().min(1),
  // Todavía no hay cobro, así que cualquier plan se activa al elegirlo. Cuando
  // exista el checkout, sólo FREE podrá seguir activándose aquí.
  plan: z.enum(Plan).default("FREE"),
});

export type CompleteAccountSetupDto = z.infer<
  typeof completeAccountSetupSchema
>;

/**
 * Crea el tenant (Account) del usuario tras el registro. El usuario ya está
 * autenticado vía la sesión de Better Auth, por lo que `userId` proviene de la
 * sesión y este caso de uso NO emite tokens.
 */
export class CompleteAccountSetupUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly accounts: IAccountRepository,
    private readonly subscriptions: ISubscriptionRepository,
    private readonly tx: ITransactionManager,
  ) {}

  async execute(userId: string, dto: CompleteAccountSetupDto) {
    return this.tx.runInTransaction(async () => {
      const account = await this.accounts.save({
        name: dto.accountName,
        ownerId: userId,
      });

      await Promise.all([
        this.users.update(userId, {
          onboardingCompleted: true,
          accountId: account.id,
        }),
        this.subscriptions.save({
          accountId: account.id,
          plan: dto.plan,
          status: "ACTIVE",
        }),
      ]);

      return { accountId: account.id };
    });
  }
}
