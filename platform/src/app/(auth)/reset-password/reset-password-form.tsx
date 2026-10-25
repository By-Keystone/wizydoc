"use client";

import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { authClient } from "@/lib/auth/client";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/form-validation";
import { Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

const TOO_MANY_REQUESTS = 429;
const RESET_PATH = "/reset-password";

// No se acopla al largo exacto de Better Auth (24): solo descarta lo que
// claramente no es un token antes de pedirle nada al api.
const TOKEN_SHAPE = /^[A-Za-z0-9]{16,128}$/;

const GENERIC_ERROR = "No pudimos guardar tu contraseña. Vuelve a intentarlo.";
const TOO_SHORT_ERROR = "Tu contraseña nueva debe tener al menos 8 caracteres.";
const TOO_LONG_ERROR = "Tu contraseña nueva puede tener hasta 128 caracteres.";

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
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string }>();
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

  useFocusFirstInvalid(formRef, fieldErrors);

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

    const passwordError = validatePassword(newPassword);
    setFieldErrors({ newPassword: passwordError });
    if (passwordError || !tokenRef.current) return;

    setPending(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword,
        token: tokenRef.current,
      });

      if (!error) {
        router.replace("/login?reset=ok");
        // El botón sigue deshabilitado hasta que la navegación desmonte el formulario.
        return;
      }

      if (error.code === "INVALID_TOKEN") {
        showInvalid();
      } else if (error.code === "PASSWORD_TOO_SHORT") {
        setFieldErrors({ newPassword: TOO_SHORT_ERROR });
      } else if (error.code === "PASSWORD_TOO_LONG") {
        setFieldErrors({ newPassword: TOO_LONG_ERROR });
      } else if (error.status === TOO_MANY_REQUESTS) {
        setSubmitError(
          "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.",
        );
      } else {
        setSubmitError(GENERIC_ERROR);
      }
    } catch {
      setSubmitError(GENERIC_ERROR);
    }
    setPending(false);
  }

  if (step === "reading") {
    return (
      <AuthCard>
        <div
          role="status"
          className="flex flex-col items-center gap-3 py-6 text-sm text-brand-gray"
        >
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Cargando…</span>
        </div>
      </AuthCard>
    );
  }

  if (step === "invalid") {
    return (
      <AuthCard
        icon={XCircle}
        tone="danger"
        title="Este enlace ya no sirve"
        description="Los enlaces duran 1 hora y sirven una sola vez. Pide otro y ábrelo desde el correo más reciente."
        titleRef={invalidTitleRef}
      >
        <Button asChild className="mt-6 w-full">
          <Link href="/forgot-password">Pedir otro enlace</Link>
        </Button>
        <p className="mt-3">
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Volver a iniciar sesión
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crea tu contraseña nueva"
      description="Usa entre 8 y 128 caracteres. Al guardarla cerramos tu sesión en todos tus dispositivos."
    >
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
          error={fieldErrors?.newPassword}
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
    </AuthCard>
  );
}

function validatePassword(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return TOO_SHORT_ERROR;
  if (password.length > MAX_PASSWORD_LENGTH) return TOO_LONG_ERROR;
}
