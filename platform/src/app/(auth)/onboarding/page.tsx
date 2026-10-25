"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/common/auth-card";
import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useCulqiCheckout } from "@/hooks/useCulqiCheckout";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import {
  createAccountAction,
  type CreateAccountState,
} from "@/lib/actions/account/create-account.action";
import { fieldError } from "@/lib/actions/types";
import { planAmountCents, type Plan } from "@/lib/plans";
import { toast } from "@/lib/toast";

const initialState: CreateAccountState = { status: "idle" };

// Cobro con Culqi congelado en la beta (docs/PRODUCT.md, «Estado»): toda cuenta nace en Gratis.
const BETA_PLAN: Plan = "FREE";

export default function OnboardingPage() {
  const [state, createAccount, isPending] = useActionState(
    createAccountAction,
    initialState,
  );
  const [cardToken, setCardToken] = useState<string | null>(null);
  // React vacía el formulario al terminar la action: el nombre vuelve a su valor inicial para no perderse tras un error.
  const [submittedName, setSubmittedName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const amountCents = planAmountCents(BETA_PLAN);
  const requiresPayment = amountCents !== null;
  const checkout = useCulqiCheckout({ enabled: requiresPayment });

  useFocusFirstInvalid(formRef, state);

  // El token de Culqi es de un solo uso: si la creación falló, el siguiente
  // intento tiene que volver a pedir la tarjeta.
  useEffect(() => {
    if (state.status === "error") setCardToken(null);
  }, [state]);

  // El token llega en un callback de Culqi, fuera del ciclo del formulario:
  // se guarda en el hidden input y se reenvía cuando ya está en el DOM.
  useEffect(() => {
    if (cardToken) formRef.current?.requestSubmit();
  }, [cardToken]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    setSubmittedName(
      String(new FormData(event.currentTarget).get("name") ?? ""),
    );
    if (!requiresPayment || cardToken) return;

    event.preventDefault();
    checkout.open({
      amountCents,
      onToken: setCardToken,
      onError: toast.error,
    });
  };

  const submitLabel = requiresPayment ? "Continuar al pago" : "Continuar";
  // `useActionState` conserva el error anterior mientras envía: se oculta para que uno repetido se vuelva a anunciar.
  const failure = state.status === "error" && !isPending ? state : undefined;
  const generalError =
    failure && !failure.fieldErrors ? failure.message : undefined;

  return (
    <AuthCard
      title="Ponle nombre a tu consultorio"
      description="Es el último paso para crear tu cuenta."
    >
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-4"
        action={createAccount}
        onSubmit={handleSubmit}
      >
        <Input
          label="Nombre del consultorio"
          name="name"
          value={submittedName}
          autoFocus
          placeholder="Consultorio Dra. Quispe"
          error={fieldError(failure?.fieldErrors, "name")}
        />

        <p className="rounded-lg bg-brand-surface px-3 py-2.5 text-sm text-brand-gray">
          Durante la beta, todas las cuentas empiezan en Gratis y los planes de
          pago se activan a pedido.
        </p>
        <input type="hidden" name="plan" value={BETA_PLAN} />

        {requiresPayment && (
          <>
            <Input
              label="Dirección de facturación"
              name="billingAddress"
              required
              placeholder="Av. Larco 123"
              error={fieldError(failure?.fieldErrors, "billingAddress")}
            />
            <Input
              label="Ciudad"
              name="billingCity"
              required
              placeholder="Lima"
              error={fieldError(failure?.fieldErrors, "billingCity")}
            />
          </>
        )}

        <input type="hidden" name="cardToken" value={cardToken ?? ""} />

        {generalError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {generalError}
          </p>
        )}

        <Button
          type="submit"
          className="mt-2 w-full"
          disabled={isPending || (requiresPayment && !checkout.isReady)}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creando tu cuenta…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
