"use client";

import { Input } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { ChevronLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import z from "zod";

const TOO_MANY_REQUESTS = 429;

const GENERIC_ERROR =
  "No pudimos enviar el enlace. Revisa tu conexión y vuelve a intentarlo.";

const TEXT_LINK_CLASS =
  "inline-flex min-h-10 items-center text-sm font-medium text-brand-teal hover:text-brand-teal-dark";

const emailSchema = z.email();

function validateEmail(email: string): string | undefined {
  if (!email) return "Escribe tu correo.";
  if (!emailSchema.safeParse(email).success) {
    return "Escribe un correo válido, por ejemplo ana@consultorio.com.";
  }
}

export function ForgotPasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [refocusEmail, setRefocusEmail] = useState(false);

  useEffect(() => {
    if (!fieldError) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [fieldError]);

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

    const validation = validateEmail(typed);
    setFieldError(validation);
    if (validation) return;

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
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/10">
            <MailCheck className="h-7 w-7 text-brand-teal" />
          </div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-bold text-brand-teal-dark focus:outline-none"
          >
            Revisa tu correo
          </h1>
          <p className="mt-2 text-sm text-brand-gray">
            Si hay una cuenta con ese correo, te enviamos un enlace para crear
            una contraseña nueva. Revisa tu bandeja y la carpeta de spam.
          </p>
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
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Recupera tu contraseña
          </h1>
          <p className="mt-1 text-sm text-brand-gray">
            Escribe el correo con el que entras a WizyDoc y te enviaremos un
            enlace para crear una contraseña nueva.
          </p>
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
            value={email}
            readOnly={pending}
            error={fieldError}
          />

          {submitError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
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

        <p className="mt-6 text-center">
          <Link href="/login" className={TEXT_LINK_CLASS}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
