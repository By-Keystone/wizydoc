"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PasswordInput } from "@/components/common/form";
import { ProfileCard } from "./profile-card";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const TOO_MANY_REQUESTS = 429;
const UNAUTHORIZED = 401;

interface Errors {
  current?: string;
  next?: string;
}

export function PasswordCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      formRef.current?.querySelector<HTMLElement>("#current-password")?.focus();
    } else if (wasOpen.current) {
      openButtonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!errors.current && !errors.next) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);

  const close = () => {
    setOpen(false);
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");

    const validation: Errors = {};
    if (!currentPassword) validation.current = "Ingresa tu contraseña actual.";
    if (newPassword.length < MIN_LENGTH) {
      validation.next = "Tu contraseña nueva debe tener al menos 8 caracteres.";
    } else if (newPassword.length > MAX_LENGTH) {
      validation.next = "Tu contraseña nueva puede tener hasta 128 caracteres.";
    }
    setErrors(validation);
    if (validation.current || validation.next) return;

    setPending(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (!error) {
        close();
        toast.success(
          "Cambiaste tu contraseña. Cerramos tu sesión en tus otros dispositivos.",
        );
        return;
      }

      if (error.status === UNAUTHORIZED) {
        router.push("/login");
      } else if (error.code === "INVALID_PASSWORD") {
        setErrors({ current: "La contraseña actual no es correcta." });
      } else if (error.code === "PASSWORD_TOO_SHORT") {
        setErrors({
          next: "Tu contraseña nueva debe tener al menos 8 caracteres.",
        });
      } else if (error.code === "PASSWORD_TOO_LONG") {
        setErrors({
          next: "Tu contraseña nueva puede tener hasta 128 caracteres.",
        });
      } else if (error.status === TOO_MANY_REQUESTS) {
        toast.error(
          "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.",
        );
      } else {
        toast.error("No pudimos cambiar tu contraseña. Vuelve a intentarlo.");
      }
    } catch {
      toast.error("No pudimos cambiar tu contraseña. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  };

  return (
    <ProfileCard
      titleId="password-title"
      title="Contraseña"
      description="Al cambiarla cerramos tu sesión en tus otros dispositivos."
      action={
        open ? null : (
          <Button
            ref={openButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="h-[34px] px-3 text-[13px]"
            onClick={() => setOpen(true)}
          >
            Cambiar contraseña
          </Button>
        )
      }
    >
      {open && (
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PasswordInput
              id="current-password"
              name="currentPassword"
              label="Contraseña actual"
              autoComplete="current-password"
              error={errors.current}
            />
            <PasswordInput
              id="new-password"
              name="newPassword"
              label="Contraseña nueva"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              error={errors.next}
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={close}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              disabled={pending}
            >
              {pending ? "Cambiando…" : "Cambiar contraseña"}
            </Button>
          </div>
        </form>
      )}
    </ProfileCard>
  );
}
