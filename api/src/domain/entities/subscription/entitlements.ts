import type { Plan, SubscriptionStatus } from "@prisma/client";
import { type Feature, PLAN_CAPABILITIES } from "./plan";

/**
 * Lo que una cuenta puede hacer hoy. Es el único objeto que consultan tanto el
 * borde (`requireFeature`) como los casos de uso que aplican cuotas, para que
 * "qué incluye el plan" no se responda de dos maneras distintas.
 */
export interface Entitlements {
  plan: Plan;
  features: readonly Feature[];
  maxDoctors: number | null;
  maxClinics: number | null;
}

interface SubscriptionState {
  plan: Plan;
  status: SubscriptionStatus;
  extraDoctors: number;
  extraClinics: number;
}

function withExtras(included: number | null, extra: number): number | null {
  return included === null ? null : included + extra;
}

/**
 * Una suscripción cancelada o inexistente degrada a FREE en lugar de bloquear
 * la cuenta: el cliente que deja de pagar conserva sus citas y sus pacientes,
 * sólo pierde las capacidades que pagaba.
 */
export function entitlementsFor(
  subscription: SubscriptionState | null,
): Entitlements {
  const plan =
    subscription && subscription.status === "ACTIVE"
      ? subscription.plan
      : "FREE";

  const capabilities = PLAN_CAPABILITIES[plan];

  return {
    plan,
    features: capabilities.features,
    maxDoctors: withExtras(
      capabilities.includedDoctors,
      subscription?.extraDoctors ?? 0,
    ),
    maxClinics: withExtras(
      capabilities.includedClinics,
      subscription?.extraClinics ?? 0,
    ),
  };
}

export function includesFeature(
  entitlements: Entitlements,
  feature: Feature,
): boolean {
  return entitlements.features.includes(feature);
}

export function isWithinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}
