import type { Plan } from "@prisma/client";

export interface BillingCustomer {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  countryCode: string;
}

export interface StartSubscriptionInput {
  customer: BillingCustomer;
  /** Token de un solo uso que el checkout del proveedor emitió en el navegador. */
  cardToken: string;
  plan: Plan;
}

export interface StartSubscriptionResult {
  customerId: string;
  cardId: string;
  subscriptionId: string;
}

export interface BillingService {
  /**
   * Da de alta el cobro recurrente de un plan: cliente, tarjeta y suscripción
   * en el proveedor. Aquí ocurre el primer cargo.
   */
  startSubscription(input: StartSubscriptionInput): Promise<StartSubscriptionResult>;
}
