"use client";

import { PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const TOO_MANY_REQUESTS = 429;
const RESET_PATH = "/reset-password";

// No se acopla al largo exacto de Better Auth (24): solo descarta lo que
// claramente no es un token antes de pedirle nada al api.
const TOKEN_SHAPE = /^[A-Za-z0-9]{16,128}$/;

const GENERIC_ERROR = "No pudimos guardar tu contraseña. Vuelve a intentarlo.";
const TOO_SHORT_ERROR = "Tu contraseña nueva debe tener al menos 8 caracteres.";
const TOO_LONG_ERROR = "Tu contraseña nueva puede tener hasta 128 caracteres.";

const TEXT_LINK_CLASS =
  "inline-flex min-h-10 items-center text-sm font-medium text-brand-teal hover:text-brand-teal-dark";

type Step = "reading" | "form" | "invalid";

function readTokenFromHash(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  return token && TOKEN_SHAPE.test(token) ? token : null;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const invalidTitleRef = useRef<HTMLHeadingElement>(null);
  const tokenRef = useRef<string | null>(null);
  const [step, setStep] = useState<Step>("reading");
  const [fieldError, setFieldError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);

  // El fragmento solo existe en el navegador: el token se lee después de
  // montar, nunca en el servidor.
  useEffect(() => {
    tokenRef.current = readTokenFromHash();
    if (tokenRef.current) {
      setStep("form");
    } else {
      window.history.replaceState(null, "", RESET_PATH);
      setStep("invalid");
    }
  }, []);

  useEffect(() => {
    if (step === "invalid") invalidTitleRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!fieldError) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [fieldError]);

  function showInvalid() {
    tokenRef.current = null;
    window.history.replaceState(null, "", RESET_PATH);
    setStep("invalid");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const newPassword = String(
      new FormData(event.currentTarget).get("newPassword") ?? "",
    );

    const validation = validatePassword(newPassword);
    setFieldError(validation);
    if (validation || !tokenRef.current) return;

    setPending(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword,
        token: tokenRef.current,
      });

      if (!error) {
        router.replace("/login?reset=ok");
        return;
      }

      if (error.code === "INVALID_TOKEN") {
        showInvalid();
      } else if (error.code === "PASSWORD_TOO_SHORT") {
        setFieldError(TOO_SHORT_ERROR);
      } else if (error.code === "PASSWORD_TOO_LONG") {
        setFieldError(TOO_LONG_ERROR);
      } else if (error.status === TOO_MANY_REQUESTS) {
        setSubmitError(
          "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.",
        );
      } else {
        setSubmitError(GENERIC_ERROR);
      }
    } catch {
      setSubmitError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (step === "reading") {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-brand-gray">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Cargando…</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <XCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1
            ref={invalidTitleRef}
            tabIndex={-1}
            className="text-2xl font-bold text-brand-teal-dark focus:outline-none"
          >
            Este enlace ya no sirve
          </h1>
          <p className="mt-2 text-sm text-brand-gray">
            Los enlaces duran 1 hora y sirven una sola vez. Pide otro y ábrelo
            desde el correo más reciente.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/forgot-password">Pedir otro enlace</Link>
          </Button>
          <p className="mt-3">
            <Link href="/login" className={TEXT_LINK_CLASS}>
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Crea tu contraseña nueva
          </h1>
          <p className="mt-1 text-sm text-brand-gray">
            Usa entre 8 y 128 caracteres. Al guardarla cerramos tu sesión en
            todos tus dispositivos.
          </p>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <PasswordInput
            id="new-password"
            name="newPassword"
            label="Contraseña nueva"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            error={fieldError}
          />

          {submitError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {submitError}
            </p>
          )}

          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar contraseña"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

function validatePassword(password: string): string | undefined {
  if (password.length < MIN_LENGTH) return TOO_SHORT_ERROR;
  if (password.length > MAX_LENGTH) return TOO_LONG_ERROR;
}
