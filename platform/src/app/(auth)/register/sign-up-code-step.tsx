"use client";

import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { requestSignUpCodeAction } from "@/lib/actions/sign-up/request-sign-up-code.action";
import { verifySignUpCodeAction } from "@/lib/actions/sign-up/verify-sign-up-code.action";
import { fieldError } from "@/lib/actions/types";
import {
  CODE_LENGTH,
  INCOMPLETE_CODE_ERROR,
  REQUEST_CODE_ERROR,
  VERIFY_CODE_ERROR,
  signUpCodeSchema,
} from "@/lib/auth/sign-up-validation";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { SignUpEmailStep } from "./sign-up-email-step";

const COUNTDOWN_TICK_MS = 1000;

interface Props {
  email: string;
  secondsUntilResend: number;
}

export function SignUpCodeStep({ email, secondsUntilResend }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(secondsUntilResend);
  const [fieldErrors, setFieldErrors] = useState<{ code?: string }>();
  const [submitError, setSubmitError] = useState<string>();
  const [resendError, setResendError] = useState<string>();
  const [wasCodeResent, setWasCodeResent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResend] = useTransition();

  useFocusFirstInvalid(formRef, fieldErrors);

  useEffect(() => {
    const codeError = fieldErrors?.code;
    if (codeError && codeError !== INCOMPLETE_CODE_ERROR) {
      formRef.current?.querySelector<HTMLInputElement>("#code")?.select();
    }
  }, [fieldErrors]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(
      () => setSecondsLeft(secondsLeft - 1),
      COUNTDOWN_TICK_MS,
    );
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function clearErrors() {
    setFieldErrors(undefined);
    setSubmitError(undefined);
    setResendError(undefined);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setSubmitError(undefined);

    const formData = new FormData(event.currentTarget);
    const parsedCode = signUpCodeSchema.safeParse(formData.get("code"));
    if (!parsedCode.success) {
      setFieldErrors({ code: parsedCode.error.issues[0].message });
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      try {
        const state = await verifySignUpCodeAction(formData);
        if (state.status === "success") return;
        if (state.status !== "error") {
          setSubmitError(VERIFY_CODE_ERROR);
          return;
        }

        const codeError = fieldError(state.fieldErrors, "code");
        if (codeError) setFieldErrors({ code: codeError });
        else setSubmitError(state.message);
      } catch {
        setSubmitError(VERIFY_CODE_ERROR);
      }
    });
  }

  function handleResend() {
    setResendError(undefined);
    setWasCodeResent(false);
    const formData = new FormData();
    formData.set("email", email);

    startResend(async () => {
      try {
        const state = await requestSignUpCodeAction(formData);
        if (state.status === "success") {
          setSecondsLeft(state.data.secondsUntilResend);
          setWasCodeResent(state.data.wasCodeSent);
          if (state.data.wasCodeSent) {
            clearErrors();
            const input =
              formRef.current?.querySelector<HTMLInputElement>("#code");
            if (input) input.value = "";
            input?.focus();
          }
        } else if (state.status === "error") {
          setResendError(state.message);
        } else {
          setResendError(REQUEST_CODE_ERROR);
        }
      } catch {
        setResendError(REQUEST_CODE_ERROR);
      }
    });
  }

  function handleCodeRequested(secondsUntilNextResend: number) {
    clearErrors();
    setWasCodeResent(false);
    setSecondsLeft(secondsUntilNextResend);
    setIsChangingEmail(false);
  }

  if (isChangingEmail) {
    return (
      <SignUpEmailStep
        defaultEmail={email}
        onCodeRequested={handleCodeRequested}
      />
    );
  }

  return (
    <AuthCard
      title="Revisa tu correo"
      description="Escribe el código de 6 dígitos que te enviamos. Vence en 10 minutos."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Inicia sesión
          </Link>
        </>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-brand-surface py-1 pl-3 pr-2">
        <span className="min-w-0 break-all text-sm font-semibold text-brand-ink">
          {email}
        </span>
        <button
          type="button"
          onClick={() => setIsChangingEmail(true)}
          className={`${TEXT_LINK_CLASS} shrink-0 px-1`}
        >
          Cambiar<span className="sr-only"> correo</span>
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <Input
          name="code"
          label="Código de 6 dígitos"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          hint="Si no lo ves, revisa la carpeta de spam."
          className="text-center text-2xl font-semibold tracking-[0.4em] text-brand-ink"
          onChange={(event) => {
            const input = event.currentTarget;
            const typedDigits = input.value.replace(/\D/g, "");
            input.value = typedDigits.slice(0, CODE_LENGTH);
            if (typedDigits.length === CODE_LENGTH) {
              formRef.current?.requestSubmit();
            }
          }}
          readOnly={isPending}
          error={fieldErrors?.code}
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
              Verificando…
            </>
          ) : (
            "Verificar código"
          )}
        </Button>
      </form>

      <div className="mt-4 flex flex-col gap-1 text-center text-sm text-brand-gray">
        <p>
          ¿No te llegó?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={secondsLeft > 0 || isResending}
            className={`${TEXT_LINK_CLASS} disabled:cursor-default disabled:text-brand-gray`}
          >
            {isResending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : secondsLeft > 0 ? (
              `Reenviar en ${secondsLeft} s`
            ) : (
              "Reenviar código"
            )}
          </button>
        </p>
        {wasCodeResent && (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 text-brand-teal-dark"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Te enviamos un código nuevo.
          </p>
        )}
        {resendError && (
          <p
            role="alert"
            className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-red-700"
          >
            {resendError}
          </p>
        )}
        <p role="status" className="sr-only">
          {secondsLeft === 0 && "Ya puedes pedir otro código."}
        </p>
      </div>
    </AuthCard>
  );
}
