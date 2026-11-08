"use client";

import { AuthCard } from "@/components/common/auth-card";
import { PasswordInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { confirmSignUpAction } from "@/lib/actions/sign-up/confirm-sign-up.action";
import { fieldError } from "@/lib/actions/types";
import {
  CONFIRM_SIGN_UP_ERROR,
  VERIFICATION_EXPIRED_CODE,
  signUpPasswordSchema,
} from "@/lib/auth/sign-up-validation";
import { Loader2, XCircle } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { SignUpEmailStep } from "./sign-up-email-step";

interface Props {
  email: string;
}

export function SignUpPasswordStep({ email }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const expiredTitleRef = useRef<HTMLHeadingElement>(null);
  const [isVerificationExpired, setIsVerificationExpired] = useState(false);
  const [isRequestingNewCode, setIsRequestingNewCode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string }>();
  const [submitError, setSubmitError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  useFocusFirstInvalid(formRef, fieldErrors);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>("#password")?.focus();
  }, []);

  useEffect(() => {
    if (isVerificationExpired) expiredTitleRef.current?.focus();
  }, [isVerificationExpired]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setSubmitError(undefined);

    const formData = new FormData(event.currentTarget);
    const parsedPassword = signUpPasswordSchema.safeParse(
      formData.get("password"),
    );
    if (!parsedPassword.success) {
      setFieldErrors({ password: parsedPassword.error.issues[0].message });
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      try {
        const state = await confirmSignUpAction(formData);
        if (state.status !== "error") return;

        if (state.code === VERIFICATION_EXPIRED_CODE) {
          setIsVerificationExpired(true);
          return;
        }
        const passwordError = fieldError(state.fieldErrors, "password");
        if (passwordError) setFieldErrors({ password: passwordError });
        else setSubmitError(state.message);
      } catch (error) {
        unstable_rethrow(error);
        setSubmitError(CONFIRM_SIGN_UP_ERROR);
      }
    });
  }

  if (isRequestingNewCode) return <SignUpEmailStep defaultEmail={email} />;

  if (isVerificationExpired) {
    return (
      <AuthCard
        icon={XCircle}
        tone="danger"
        title="Tu verificación venció"
        description="Vuelve a pedir el código."
        titleRef={expiredTitleRef}
      >
        <Button
          type="button"
          className="mt-6 w-full"
          onClick={() => setIsRequestingNewCode(true)}
        >
          Pedir un código nuevo
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crea tu contraseña"
      description={
        <>
          Con ella entrarás a WizyDoc como{" "}
          <b className="break-all font-semibold text-brand-ink">{email}</b>.
        </>
      }
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        <input
          type="email"
          name="username"
          autoComplete="username"
          defaultValue={email}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          readOnly
        />

        <PasswordInput
          id="password"
          name="password"
          label="Contraseña"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          error={fieldErrors?.password}
        />

        {submitError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {submitError}
          </p>
        )}

        <Button type="submit" className="mt-2 w-full" disabled={isPending}>
          {isPending ? (
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
