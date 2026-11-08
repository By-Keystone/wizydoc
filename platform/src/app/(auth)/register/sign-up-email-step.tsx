"use client";

import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { requestSignUpCodeAction } from "@/lib/actions/sign-up/request-sign-up-code.action";
import { fieldError } from "@/lib/actions/types";
import {
  REQUEST_CODE_ERROR,
  signUpEmailSchema,
} from "@/lib/auth/sign-up-validation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState, useTransition } from "react";

interface FieldErrors {
  email?: string;
}

export function SignUpEmailStep() {
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [submitError, setSubmitError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  useFocusFirstInvalid(formRef, fieldErrors);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const formData = new FormData(event.currentTarget);
    const parsedEmail = signUpEmailSchema.safeParse(formData.get("email"));
    if (!parsedEmail.success) {
      setFieldErrors({ email: parsedEmail.error.issues[0].message });
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      try {
        const state = await requestSignUpCodeAction(formData);
        if (state.status === "success") return;
        if (state.status !== "error") {
          setSubmitError(REQUEST_CODE_ERROR);
          return;
        }

        const emailError = fieldError(state.fieldErrors, "email");
        if (emailError) setFieldErrors({ email: emailError });
        else setSubmitError(state.message);
      } catch {
        setSubmitError(REQUEST_CODE_ERROR);
      }
    });
  }

  return (
    <AuthCard
      title="Crea tu cuenta"
      description="Empieza gratis, sin tarjeta de crédito"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Inicia sesión
          </Link>
        </>
      }
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <Input
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          placeholder="ana@consultorio.com"
          hint="Te enviaremos un código para confirmarlo."
          readOnly={isPending}
          error={fieldErrors?.email}
        />

        {submitError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {submitError}
          </p>
        )}

        <Button type="submit" className="mt-2 w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando código…
            </>
          ) : (
            "Continuar"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
