"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/common/form";
import {
  createAccountAction,
  type CreateAccountState,
} from "@/lib/actions/account/create-account.action";
import { fieldError } from "@/lib/actions/types";
import { toast } from "@/lib/toast";

const initialState: CreateAccountState = { status: "idle" };

export default function OnboardingPage() {
  const [state, createAccount, isPending] = useActionState(
    createAccountAction,
    initialState,
  );

  // Los errores por campo se pintan inline; el mensaje general va al toast.
  useEffect(() => {
    if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state]);

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

        <form className="flex flex-col gap-4" action={createAccount}>
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

          <Button type="submit" className="mt-2 w-full" disabled={isPending}>
            {isPending ? "Creando..." : "Continuar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
