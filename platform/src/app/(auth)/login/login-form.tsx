"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Input, PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { authClient } from "@/lib/auth/client";
import { hasErrors, validateEmail } from "@/lib/auth/form-validation";
import { safeInternalPath } from "@/lib/auth/safe-internal-path";

const TOO_MANY_REQUESTS = 429;

const WRONG_CREDENTIALS_ERROR = "El correo o la contraseña no son correctos.";
const UNVERIFIED_EMAIL_ERROR =
  "Primero confirma tu correo con el enlace que te enviamos al registrarte.";
const TOO_MANY_ATTEMPTS_ERROR =
  "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";
const GENERIC_ERROR =
  "No pudimos iniciar sesión. Revisa tu conexión y vuelve a intentarlo.";

interface Props {
  /** Ruta a la que volver tras iniciar sesión (la que el usuario intentaba abrir). */
  callbackUrl?: string;
  /** Llegó de crear su contraseña nueva (`?reset=ok`). */
  passwordReset?: boolean;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

function validateCredentials(email: string, password: string): FieldErrors {
  return {
    email: validateEmail(email),
    password: password ? undefined : "Escribe tu contraseña.",
  };
}

function signInErrorMessage(error: { code?: string; status: number }) {
  if (error.code === "INVALID_EMAIL_OR_PASSWORD")
    return WRONG_CREDENTIALS_ERROR;
  if (error.code === "EMAIL_NOT_VERIFIED") return UNVERIFIED_EMAIL_ERROR;
  if (error.status === TOO_MANY_REQUESTS) return TOO_MANY_ATTEMPTS_ERROR;
  return GENERIC_ERROR;
}

export function LoginForm({ callbackUrl, passwordReset }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [showResetNotice, setShowResetNotice] = useState(false);

  useFocusFirstInvalid(formRef, fieldErrors);

  // Un aviso que ya está en el HTML al cargar no se anuncia: la región
  // `role="status"` va vacía en el servidor y el texto entra tras montar.
  useEffect(() => {
    setShowResetNotice(Boolean(passwordReset));
  }, [passwordReset]);

  const callback = safeInternalPath(callbackUrl);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setPending(true);
    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
      });

      if (!error) {
        // Sin cuenta todavía → onboarding; si ya tiene, a donde intentaba ir
        // (callbackUrl) o a su selector de recursos.
        const accountId = data?.user?.accountId;
        router.push(
          accountId
            ? (callback ?? `/account/${accountId}/select`)
            : "/onboarding",
        );
        // El botón sigue deshabilitado hasta que la navegación desmonte el formulario.
        return;
      }
      setSubmitError(signInErrorMessage(error));
    } catch {
      setSubmitError(GENERIC_ERROR);
    }
    setPending(false);
  }

  return (
    <AuthCard
      title="Hola de nuevo"
      description="Ingresa a tu cuenta para continuar"
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/register" className={TEXT_LINK_CLASS}>
            Regístrate gratis
          </Link>
        </>
      }
    >
      <div role="status">
        {showResetNotice && (
          <p className="mb-5 flex items-start gap-2 rounded-lg bg-brand-teal/10 px-3 py-2 text-sm text-brand-teal-dark">
            <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <span>
              Listo, ya puedes iniciar sesión con tu contraseña nueva.
            </span>
          </p>
        )}
      </div>

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
          error={fieldErrors.email}
        />

        <PasswordInput
          id="password"
          name="password"
          label="Contraseña"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          error={fieldErrors.password}
        />

        <div className="-mt-2 flex justify-end">
          <Link href="/forgot-password" className={TEXT_LINK_CLASS}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

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
              Iniciando sesión…
            </>
          ) : (
            "Iniciar sesión"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
