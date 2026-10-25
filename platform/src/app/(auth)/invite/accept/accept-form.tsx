"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/common/auth-card";
import { PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { validatePassword } from "@/lib/auth/form-validation";
import type { InvitationStep } from "@/lib/api/invitations";

const SERVER_ERROR_STATUS = 500;

const ACTIVATE_CONNECTION_ERROR =
  "No pudimos activar tu cuenta. Revisa tu conexión y vuelve a intentarlo.";
const ACCEPT_CONNECTION_ERROR =
  "No pudimos aceptar la invitación. Revisa tu conexión y vuelve a intentarlo.";

interface Props {
  token: string;
  name: string;
  resourceName: string;
  step: InvitationStep;
}

interface FieldErrors {
  password?: string;
}

// Un 5xx puede traer detalles internos del servidor: nunca se muestran.
async function messageToShow(res: Response, fallback: string) {
  if (res.status >= SERVER_ERROR_STATUS) return fallback;
  const body = await res.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

export function AcceptInviteForm({ token, name, resourceName, step }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>();
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);
  const needsPassword = step === "set_password";

  useFocusFirstInvalid(formRef, fieldErrors);

  // Usuario que ya tenía contraseña (invitado a otra sede): sólo acepta.
  async function handleAccept() {
    setSubmitError(undefined);
    setPending(true);

    try {
      // Sin body ni Content-Type: Fastify rechaza un body vacío si el Content-Type es application/json.
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        router.push("/login");
        // El botón sigue deshabilitado hasta que la navegación desmonte el formulario.
        return;
      }
      setSubmitError(
        await messageToShow(res, "No se pudo aceptar la invitación"),
      );
    } catch {
      setSubmitError(ACCEPT_CONNECTION_ERROR);
    }
    setPending(false);
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );

    const passwordError = validatePassword(password);
    setFieldErrors({ password: passwordError });
    if (passwordError) return;

    setPending(true);
    try {
      const res = await fetch(`/api/invitations/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        const { accountId, isSignedIn } = (await res.json()).data;
        router.push(isSignedIn ? `/account/${accountId}/select` : "/login");
        // El botón sigue deshabilitado hasta que la navegación desmonte el formulario.
        return;
      }
      setSubmitError(
        await messageToShow(res, "No se pudo configurar la contraseña"),
      );
    } catch {
      setSubmitError(ACTIVATE_CONNECTION_ERROR);
    }
    setPending(false);
  }

  const errorAlert = submitError && (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {submitError}
    </p>
  );

  return (
    <AuthCard
      title={`Hola, ${name}. Te invitaron a ${resourceName}`}
      description={
        needsPassword
          ? "Crea una contraseña para activar tu cuenta."
          : "Acepta la invitación para unirte al equipo."
      }
    >
      {needsPassword ? (
        <form
          ref={formRef}
          onSubmit={handleSetPassword}
          noValidate
          className="flex flex-col gap-4"
        >
          <PasswordInput
            id="password"
            name="password"
            label="Contraseña"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            error={fieldErrors?.password}
          />
          {errorAlert}
          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activando…
              </>
            ) : (
              "Activar cuenta"
            )}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {errorAlert}
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={handleAccept}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aceptando…
              </>
            ) : (
              "Aceptar invitación"
            )}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
