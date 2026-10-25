"use client";

import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { authClient } from "@/lib/auth/client";
import { validateEmail } from "@/lib/auth/form-validation";
import { ChevronLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

const TOO_MANY_REQUESTS = 429;

const GENERIC_ERROR =
  "No pudimos enviar el enlace. Revisa tu conexión y vuelve a intentarlo.";

export function ForgotPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>();
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [refocusEmail, setRefocusEmail] = useState(false);

  useFocusFirstInvalid(formRef, fieldErrors);

  useEffect(() => {
    if (sent) titleRef.current?.focus();
  }, [sent]);

  useEffect(() => {
    if (sent || !refocusEmail) return;
    formRef.current?.querySelector<HTMLElement>('input[name="email"]')?.focus();
    setRefocusEmail(false);
  }, [sent, refocusEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    setEmail(typed);
    setSubmitError(undefined);

    const emailError = validateEmail(typed);
    setFieldErrors({ email: emailError });
    if (emailError) return;

    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({ email: typed });

      if (!error) {
        setSent(true);
      } else if (error.status === TOO_MANY_REQUESTS) {
        setSubmitError(
          "Hiciste varios pedidos seguidos. Espera 10 minutos y vuelve a intentarlo.",
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

  if (sent) {
    return (
      <AuthCard
        icon={MailCheck}
        title="Revisa tu correo"
        description="Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja y la carpeta de spam."
        titleRef={titleRef}
      >
        <p className="mt-4 rounded-lg bg-brand-surface px-3 py-2.5 text-left text-sm text-brand-gray">
          Correo que escribiste:{" "}
          <b className="break-all font-semibold text-brand-ink">{email}</b>
          <br />
          El enlace dura 1 hora.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
        <p className="mt-3 text-sm text-brand-gray">
          ¿Lo escribiste mal o no llegó?{" "}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setRefocusEmail(true);
            }}
            className={TEXT_LINK_CLASS}
          >
            Pide otro enlace
          </button>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recupera tu contraseña"
      description="Escribe el correo con el que entras a WizyDoc y te enviaremos un enlace para crear una contraseña nueva."
      footer={
        <Link href="/login" className={TEXT_LINK_CLASS}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Volver a iniciar sesión
        </Link>
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
          value={email}
          readOnly={pending}
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

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando…
            </>
          ) : (
            "Enviar enlace"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
