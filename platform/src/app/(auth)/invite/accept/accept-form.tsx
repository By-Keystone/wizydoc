"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvitationStep } from "@/lib/api/invitations";

interface Props {
  token: string;
  name: string;
  resourceName: string;
  step: InvitationStep;
}

export function AcceptInviteForm({ token, name, resourceName, step }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const needsPassword = step === "set_password";

  // Usuario que ya tenía contraseña (invitado a otra sede): sólo acepta.
  async function handleAccept() {
    setError(null);
    setPending(true);

    try {
      // Sin body ni Content-Type: Fastify rechaza un body vacío si el Content-Type es application/json.
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "No se pudo aceptar la invitación");
        return;
      }

      router.push("/login");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function handleSetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setPending(true);

    const password = new FormData(event.currentTarget).get(
      "password",
    ) as string;

    try {
      const res = await fetch(`/api/invitations/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "No se pudo configurar la contraseña");
        return;
      }

      const { accountId, isSignedIn } = (await res.json()).data;

      router.push(isSignedIn ? `/account/${accountId}/select` : "/login");
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/10">
            <MailCheck className="h-7 w-7 text-brand-teal" />
          </div>
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Hola {name}, te invitaron a {resourceName}
          </h1>
          <p className="mt-2 text-sm text-brand-gray">
            {needsPassword
              ? "Configura una contraseña para activar tu cuenta."
              : "Acepta la invitación para unirte al equipo."}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {needsPassword ? (
          <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-brand-gray"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activando...
                </>
              ) : (
                "Activar cuenta"
              )}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={handleAccept}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              "Aceptar invitación"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
