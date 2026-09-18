import { Plan } from "@prisma/client";
import { z } from "zod";
import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import type { BillingService } from "@/application/ports/billing-service.port";
import { requiresPayment } from "@/domain/entities/subscription/plan";
import type { IAccountRepository } from "@/domain/repositories/account.repository";
import type { ISubscriptionRepository } from "@/domain/repositories/subscription.repository";
import type { IUserRepository } from "@/domain/repositories/user.repository";
import type { ITransactionManager } from "@/domain/services/transaction-manager";

// El producto cobra en soles a clínicas peruanas; el país no se pregunta.
const BILLING_COUNTRY_CODE = "PE";

export const completeAccountSetupSchema = z
  .object({
    accountName: z.string().min(1),
    plan: z.enum(Plan).default("FREE"),
    // Token de un solo uso emitido por el checkout de Culqi en el navegador.
    cardToken: z.string().min(1).optional(),
    // Culqi exige dirección y ciudad para crear el cliente.
    billingAddress: z.string().min(1).optional(),
    billingCity: z.string().min(1).optional(),
  })
  .refine(
    (dto) =>
      !requiresPayment(dto.plan) ||
      (dto.cardToken && dto.billingAddress && dto.billingCity),
    {
      message: "Este plan requiere tarjeta, dirección y ciudad de facturación",
      path: ["cardToken"],
    },
  );

export type CompleteAccountSetupDto = z.infer<
  typeof completeAccountSetupSchema
>;

/**
 * Crea el tenant (Account) del usuario tras el registro. El usuario ya está
 * autenticado vía la sesión de Better Auth, por lo que `userId` proviene de la
 * sesión y este caso de uso NO emite tokens.
 *
 * Con un plan de pago, además da de alta el cobro en el proveedor. Va dentro de
 * la transacción para que un rechazo de la tarjeta no deje una cuenta creada
 * con un plan que nadie pagó.
 */
export class CompleteAccountSetupUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly accounts: IAccountRepository,
    private readonly subscriptions: ISubscriptionRepository,
    private readonly billing: BillingService,
    private readonly tx: ITransactionManager,
  ) {}

  async execute(userId: string, dto: CompleteAccountSetupDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFound("User not found");

    return this.tx.runInTransaction(async () => {
      const account = await this.accounts.save({
        name: dto.accountName,
        ownerId: userId,
      });

      await this.users.update(userId, {
        onboardingCompleted: true,
        accountId: account.id,
      });

      const paymentProvider = requiresPayment(dto.plan)
        ? await this.startBilling(user, dto)
        : undefined;

      await this.subscriptions.save({
        accountId: account.id,
        plan: dto.plan,
        status: "ACTIVE",
        paymentProvider,
      });

      return { accountId: account.id };
    });
  }

  private async startBilling(
    user: { email: string; name: string; lastName: string; phone: string },
    dto: CompleteAccountSetupDto,
  ) {
    if (!dto.cardToken || !dto.billingAddress || !dto.billingCity) {
      throw new UnprocessableEntity(
        "Este plan requiere tarjeta, dirección y ciudad de facturación",
      );
    }

    const result = await this.billing.startSubscription({
      plan: dto.plan,
      cardToken: dto.cardToken,
      customer: {
        email: user.email,
        firstName: user.name,
        lastName: user.lastName,
        phone: user.phone,
        address: dto.billingAddress,
        city: dto.billingCity,
        countryCode: BILLING_COUNTRY_CODE,
      },
    });

    // Si el commit falla después de esto, la suscripción queda huérfana en el
    // proveedor y hay que cancelarla a mano: el id tiene que estar en el log.
    console.info("[billing] subscription started", {
      plan: dto.plan,
      subscriptionId: result.subscriptionId,
    });

    return result;
  }
}
