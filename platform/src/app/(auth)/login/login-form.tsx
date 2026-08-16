"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

interface Props {
  /** Ruta a la que volver tras iniciar sesión (la que el usuario intentaba abrir). */
  callbackUrl?: string;
}

// Solo aceptamos rutas internas relativas para evitar open-redirect.
function safeInternalPath(path?: string): string | null {
  if (!path) return null;
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export function LoginForm({ callbackUrl }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const callback = safeInternalPath(callbackUrl);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    const { data, error } = await authClient.signIn.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });

    setPending(false);

    if (error) {
      setError(error.message ?? "Credenciales inválidas");
      return;
    }

    // Sin cuenta todavía → onboarding; si ya tiene, a donde intentaba ir
    // (callbackUrl) o a su selector de recursos.
    if (!data?.user?.accountId) {
      router.push("/onboarding");
      return;
    }
    router.push(callback ?? `/account/${data.user.accountId}/select`);
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Bienvenido de vuelta
          </h1>
          <p className="mt-1 text-sm text-brand-gray">
            Ingresa a tu cuenta para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-brand-gray"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="ana@consultorio.com"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
            />
          </div>

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
              autoComplete="current-password"
              placeholder="Tu contraseña"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-2 w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando sesión...
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-gray">
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            className="font-medium text-brand-teal hover:text-brand-teal-dark"
          >
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
