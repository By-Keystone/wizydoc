"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Field, Input, PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { authClient } from "@/lib/auth/client";
import {
  INVALID_EMAIL_ERROR,
  PASSWORD_TOO_LONG_ERROR,
  PASSWORD_TOO_SHORT_ERROR,
  hasErrors,
  validateEmail,
  validatePassword,
} from "@/lib/auth/form-validation";

const TOO_MANY_REQUESTS = 429;
const PERU_COUNTRY_CODE = "+51";

const TOO_MANY_ATTEMPTS_ERROR =
  "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";
const GENERIC_ERROR =
  "No pudimos crear tu cuenta. Revisa tu conexión y vuelve a intentarlo.";

interface FieldErrors {
  name?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
}

interface Registration {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

function validateRegistration(registration: Registration): FieldErrors {
  return {
    name: registration.name ? undefined : "Escribe tu nombre.",
    lastName: registration.lastName ? undefined : "Escribe tu apellido.",
    email: validateEmail(registration.email),
    phone: registration.phone ? undefined : "Escribe tu celular.",
    password: validatePassword(registration.password),
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string>();
  const [pending, setPending] = useState(false);

  useFocusFirstInvalid(formRef, fieldErrors);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    const form = new FormData(event.currentTarget);
    const registration: Registration = {
      name: String(form.get("name") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const errors = validateRegistration(registration);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setPending(true);
    try {
      const { error } = await authClient.signUp.email({
        ...registration,
        callbackURL: "/onboarding",
      });

      if (!error) {
        // Requiere verificar el correo: mostramos "revisa tu correo".
        // Al confirmar el link, BA loguea (autoSignInAfterVerification) y va al callbackURL.
        router.push("/confirm-email");
        // El botón sigue deshabilitado hasta que la navegación desmonte el formulario.
        return;
      }

      if (error.code === "INVALID_EMAIL") {
        setFieldErrors({ email: INVALID_EMAIL_ERROR });
      } else if (error.code === "PASSWORD_TOO_SHORT") {
        setFieldErrors({ password: PASSWORD_TOO_SHORT_ERROR });
      } else if (error.code === "PASSWORD_TOO_LONG") {
        setFieldErrors({ password: PASSWORD_TOO_LONG_ERROR });
      } else if (error.status === TOO_MANY_REQUESTS) {
        setSubmitError(TOO_MANY_ATTEMPTS_ERROR);
      } else {
        setSubmitError(GENERIC_ERROR);
      }
    } catch {
      setSubmitError(GENERIC_ERROR);
    }
    setPending(false);
  }

  return (
    <AuthCard
      title="Crea tu cuenta"
      description="Empieza gratis, sin tarjeta de crédito"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Inicia sesión
          </Link>
        </>
      }
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            name="name"
            label="Nombre"
            autoComplete="given-name"
            placeholder="Ana"
            error={fieldErrors.name}
          />
          <Input
            name="lastName"
            label="Apellido"
            autoComplete="family-name"
            placeholder="García"
            error={fieldErrors.lastName}
          />
        </div>

        <Input
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          placeholder="ana@consultorio.com"
          error={fieldErrors.email}
        />

        <Field label="Celular" htmlFor="phone" error={fieldErrors.phone}>
          <PhoneInput
            id="phone"
            name="phone"
            autoComplete="tel-national"
            defaultCountryCode={PERU_COUNTRY_CODE}
            placeholder="999 888 777"
            invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
          />
        </Field>

        <PasswordInput
          id="password"
          name="password"
          label="Contraseña"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          error={fieldErrors.password}
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
              Creando tu cuenta…
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
