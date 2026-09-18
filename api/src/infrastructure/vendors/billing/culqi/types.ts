export enum IntervalUnitTime {
  DAILY = 1,
  WEEKLY = 2,
  MONTHLY = 3,
  YEARLY = 4,
  QUARTERLY = 5,
  SEMIANNUAL = 6,
}

export interface CreatePlanRequest {
  name: string;
  short_name: string;
  description: string;
  /** En céntimos: S/ 79.00 = 7900. */
  amount: number;
  currency: "PEN" | "USD";
  interval_unit_time: IntervalUnitTime;
  /** Número total de cobros; 0 = indefinido. */
  interval_count: number;
  initial_cycles: {
    count: number;
    has_initial_charge: boolean;
    amount: number;
    interval_unit_time: IntervalUnitTime;
  };
  metadata?: Record<string, unknown>;
}

export interface CreatePlanResponse {
  id: string;
  slug: string;
}

export interface CreateCustomerRequest {
  first_name: string;
  last_name: string;
  email: string;
  address: string;
  address_city: string;
  country_code: string;
  phone_number: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCardRequest {
  customer_id: string;
  token_id: string;
  /** `true` hace un cargo de S/ 3 y lo devuelve para validar la tarjeta. */
  validate: boolean;
}

export interface CreateSubscriptionRequest {
  card_id: string;
  plan_id: string;
  tyc: boolean;
  metadata?: Record<string, unknown>;
}

export interface CulqiIdResponse {
  id: string;
}

export interface CulqiErrorBody {
  user_message?: string;
  merchant_message?: string;
  code?: string;
}
