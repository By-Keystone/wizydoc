"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import { authClient } from "@/lib/auth/client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);

    const { error } = await authClient.signUp.email({
      name: form.get("name") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      phone: form.get("phone") as string,
      password: form.get("password") as string,
      callbackURL: "/onboarding",
    });

    setPending(false);

    if (error) {
      setError(error.message ?? "No se pudo crear la cuenta");
      return;
    }

    // Requiere verificar el correo: mostramos "revisa tu correo".
    // Al confirmar el link, BA loguea (autoSignInAfterVerification) y va al callbackURL.
    router.push("/confirm-email");
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-brand-teal-dark">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-brand-gray">
            Empieza gratis, sin tarjeta de crédito
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="name"
                className="text-sm font-medium text-brand-gray"
              >
                Nombre
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="given-name"
                placeholder="Ana"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="lastname"
                className="text-sm font-medium text-brand-gray"
              >
                Apellido
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                autoComplete="family-name"
                placeholder="García"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
              />
            </div>
          </div>

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
              htmlFor="phone"
              className="text-sm font-medium text-brand-gray"
            >
              Celular
            </label>
            <PhoneInput
              id="phone"
              name="phone"
              required
              placeholder="999 888 777"
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
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 w-full rounded-lg bg-brand-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-teal-dark disabled:opacity-60"
          >
            {pending ? "Creando..." : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-gray">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-brand-teal hover:text-brand-teal-dark"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
