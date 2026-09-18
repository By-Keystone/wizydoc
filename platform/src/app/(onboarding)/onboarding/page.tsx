"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/common/form";
import { PLAN_OPTIONS, planAmountCents, type Plan } from "@/lib/plans";
import {
  createAccountAction,
  type CreateAccountState,
} from "@/lib/actions/account/create-account.action";
import { fieldError } from "@/lib/actions/types";
import { useCulqiCheckout } from "@/hooks/useCulqiCheckout";
import { toast } from "@/lib/toast";

const initialState: CreateAccountState = { status: "idle" };

export default function OnboardingPage() {
  const [state, createAccount, isPending] = useActionState(
    createAccountAction,
    initialState,
  );
  const [plan, setPlan] = useState<Plan>("FREE");
  const [cardToken, setCardToken] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const checkout = useCulqiCheckout();

  const amountCents = planAmountCents(plan);
  const requiresPayment = amountCents !== null;

  // Los errores por campo se pintan inline; el mensaje general va al toast.
  // El token de Culqi es de un solo uso: si la creación falló, el siguiente
  // intento tiene que volver a pedir la tarjeta.
  useEffect(() => {
    if (state.status === "error") {
      setCardToken(null);
      if (!state.fieldErrors) toast.error(state.message);
    }
  }, [state]);

  // El token llega en un callback de Culqi, fuera del ciclo del formulario:
  // se guarda en el hidden input y se reenvía cuando ya está en el DOM.
  useEffect(() => {
    if (cardToken) formRef.current?.requestSubmit();
  }, [cardToken]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!requiresPayment || cardToken) return;

    event.preventDefault();
    checkout.open({
      amountCents,
      onToken: setCardToken,
      onError: toast.error,
    });
  };

  const submitLabel = isPending
    ? "Creando..."
    : requiresPayment
      ? "Continuar al pago"
      : "Continuar";

  return (
    <div className="w-full max-w-md flex justify-self-center h-dvh items-center">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Crea tu cuenta
          </h1>
          <p className="mt-1 text-sm text-brand-gray">
            Configura tu cuenta en WizyDoc para empezar a gestionar tus citas.
          </p>
        </div>

        <form
          ref={formRef}
          className="flex flex-col gap-4"
          action={createAccount}
          onSubmit={handleSubmit}
        >
          <Input
            label="Nombre de la cuenta"
            name="name"
            required
            autoFocus
            placeholder="Mi consultorio"
            error={
              state.status === "error"
                ? fieldError(state.fieldErrors, "name")
                : undefined
            }
          />

          <Select
            label="Plan"
            name="plan"
            required
            value={plan}
            onChange={(event) => setPlan(event.target.value as Plan)}
            options={PLAN_OPTIONS}
            error={
              state.status === "error"
                ? fieldError(state.fieldErrors, "plan")
                : undefined
            }
          />

          {requiresPayment && (
            <>
              <Input
                label="Dirección de facturación"
                name="billingAddress"
                required
                placeholder="Av. Larco 123"
                error={
                  state.status === "error"
                    ? fieldError(state.fieldErrors, "billingAddress")
                    : undefined
                }
              />
              <Input
                label="Ciudad"
                name="billingCity"
                required
                placeholder="Lima"
                error={
                  state.status === "error"
                    ? fieldError(state.fieldErrors, "billingCity")
                    : undefined
                }
              />
            </>
          )}

          <input type="hidden" name="cardToken" value={cardToken ?? ""} />

          <Button
            type="submit"
            className="mt-2 w-full"
            disabled={isPending || (requiresPayment && !checkout.isReady)}
          >
            {submitLabel}
          </Button>
        </form>
      </div>
    </div>
  );
}
