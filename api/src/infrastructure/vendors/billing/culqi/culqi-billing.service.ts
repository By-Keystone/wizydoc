import { PaymentFailed } from "@/application/errors/payment-failed.error";
import type {
  BillingService,
  StartSubscriptionInput,
  StartSubscriptionResult,
} from "@/application/ports/billing-service.port";
import type { Plan } from "@prisma/client";
import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  CreateCardRequest,
  CreateCustomerRequest,
  CreatePlanRequest,
  CreatePlanResponse,
  CreateSubscriptionRequest,
  CulqiErrorBody,
  CulqiIdResponse,
} from "./types";

export interface CulqiBillingServiceOptions {
  baseUrl: string;
  privateKey: string;
  /** Ids `pln_...` de los planes ya creados en Culqi, uno por plan de pago. */
  planIds: Partial<Record<Plan, string>>;
}

export class CulqiBillingService implements BillingService {
  private readonly http: AxiosInstance;
  private readonly planIds: Partial<Record<Plan, string>>;

  constructor(options: CulqiBillingServiceOptions) {
    this.planIds = options.planIds;
    this.http = axios.create({
      baseURL: options.baseUrl,
      headers: {
        Authorization: `Bearer ${options.privateKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async startSubscription(
    input: StartSubscriptionInput,
  ): Promise<StartSubscriptionResult> {
    const planId = this.planIds[input.plan];

    if (!planId) {
      throw new Error(`No Culqi plan configured for plan ${input.plan}`);
    }

    const customer = await this.createCustomer({
      first_name: input.customer.firstName,
      last_name: input.customer.lastName,
      email: input.customer.email,
      phone_number: input.customer.phone,
      address: input.customer.address,
      address_city: input.customer.city,
      country_code: input.customer.countryCode,
    });

    // Sin validar: la suscripción cobra inmediatamente después, y el cargo de
    // validación aparecería como un segundo movimiento en la tarjeta.
    const card = await this.createCard({
      customer_id: customer.id,
      token_id: input.cardToken,
      validate: false,
    });

    const subscription = await this.createSubscription({
      card_id: card.id,
      plan_id: planId,
      tyc: true,
      metadata: { plan: input.plan },
    });

    return {
      customerId: customer.id,
      cardId: card.id,
      subscriptionId: subscription.id,
    };
  }

  /** Los planes se crean una vez; sirve para un script de alta, no para el flujo de cobro. */
  async createPlan(request: CreatePlanRequest): Promise<CreatePlanResponse> {
    return this.post<CreatePlanResponse>("/v2/recurrent/plans/create", request);
  }

  private createCustomer(request: CreateCustomerRequest) {
    return this.post<CulqiIdResponse>("/v2/customers", request);
  }

  private createCard(request: CreateCardRequest) {
    return this.post<CulqiIdResponse>("/v2/cards", request);
  }

  private createSubscription(request: CreateSubscriptionRequest) {
    return this.post<CulqiIdResponse>("/v2/recurrent/subscriptions/create", request);
  }

  private async post<Response>(path: string, body: unknown): Promise<Response> {
    try {
      const response = await this.http.post<Response>(path, body);
      return response.data;
    } catch (error) {
      throw toPaymentFailed(error, path);
    }
  }
}

function toPaymentFailed(error: unknown, path: string): Error {
  if (!(error instanceof AxiosError)) return error as Error;

  const body = error.response?.data as CulqiErrorBody | undefined;

  console.error("[culqi] request failed", {
    path,
    status: error.response?.status,
    code: body?.code,
    merchantMessage: body?.merchant_message,
  });

  return new PaymentFailed(
    body?.user_message ??
      "No se pudo procesar el pago. No se realizó ningún cargo.",
  );
}
